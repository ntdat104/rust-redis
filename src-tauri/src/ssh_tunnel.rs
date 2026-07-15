use crate::error::{AppError, AppResult};
use crate::models::ConnectionProfile;
use russh::client::{self, Handler};
use russh::keys::key;
use std::sync::Arc;
use tokio::io::copy_bidirectional;
use tokio::net::TcpListener;

/// SSH client handler that trusts the configured host. A desktop tool connects
/// to hosts the user explicitly set up; known-hosts verification can be layered
/// on later.
struct AcceptAll;

#[async_trait::async_trait]
impl Handler for AcceptAll {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

/// A live SSH tunnel. Dropping it aborts the forwarding task, which releases the
/// last `Arc<Handle>` and tears down the SSH session.
pub struct SshTunnel {
    pub local_port: u16,
    task: tokio::task::JoinHandle<()>,
}

impl Drop for SshTunnel {
    fn drop(&mut self) {
        self.task.abort();
    }
}

/// Open an SSH connection and forward a fresh local port to
/// `target_host:target_port` through it. Returns the local port the Redis
/// client should connect to.
pub async fn open(
    profile: &ConnectionProfile,
    target_host: &str,
    target_port: u16,
) -> AppResult<SshTunnel> {
    let ssh_host = profile.ssh_host.clone().unwrap_or_default();
    if ssh_host.trim().is_empty() {
        return Err(AppError::Other("SSH host is required".into()));
    }
    let ssh_port = profile.ssh_port.unwrap_or(22);
    let ssh_user = profile
        .ssh_user
        .clone()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "root".into());

    let config = Arc::new(client::Config::default());
    let mut handle = client::connect(config, (ssh_host.as_str(), ssh_port), AcceptAll)
        .await
        .map_err(|e| AppError::Other(format!("SSH connect failed: {e}")))?;

    // Key auth if a private key is supplied, otherwise password auth.
    let authenticated = match profile
        .ssh_private_key
        .clone()
        .filter(|s| !s.trim().is_empty())
    {
        Some(pem) => {
            let keypair =
                russh::keys::decode_secret_key(&pem, profile.ssh_passphrase.as_deref())
                    .map_err(|e| AppError::Other(format!("invalid SSH key: {e}")))?;
            handle
                .authenticate_publickey(&ssh_user, Arc::new(keypair))
                .await
                .map_err(|e| AppError::Other(format!("SSH auth failed: {e}")))?
        }
        None => handle
            .authenticate_password(&ssh_user, profile.ssh_password.clone().unwrap_or_default())
            .await
            .map_err(|e| AppError::Other(format!("SSH auth failed: {e}")))?,
    };

    if !authenticated {
        return Err(AppError::Other("SSH authentication rejected".into()));
    }

    let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
    let local_port = listener.local_addr()?.port();

    let handle = Arc::new(handle);
    let target_host = target_host.to_string();

    let task = tokio::spawn(async move {
        loop {
            let (mut socket, _) = match listener.accept().await {
                Ok(v) => v,
                Err(_) => break,
            };
            let handle = handle.clone();
            let host = target_host.clone();
            tokio::spawn(async move {
                let channel = match handle
                    .channel_open_direct_tcpip(host, target_port as u32, "127.0.0.1", 0)
                    .await
                {
                    Ok(c) => c,
                    Err(_) => return,
                };
                let mut stream = channel.into_stream();
                let _ = copy_bidirectional(&mut socket, &mut stream).await;
            });
        }
    });

    Ok(SshTunnel { local_port, task })
}
