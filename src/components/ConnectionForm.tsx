import { useState } from "react";
import { api } from "../api";
import type { ConnectionMode, ConnectionProfile } from "../types";

const EMPTY: ConnectionProfile = {
  id: "",
  name: "",
  host: "127.0.0.1",
  port: 6379,
  username: "",
  password: "",
  db: 0,
  useTls: false,
  mode: "standalone",
  nodes: [],
  sentinelMaster: "",
  useSsh: false,
  sshHost: "",
  sshPort: 22,
  sshUser: "",
  sshPassword: "",
  sshPrivateKey: "",
  sshPassphrase: "",
};

const MODES: { value: ConnectionMode; label: string }[] = [
  { value: "standalone", label: "Standalone" },
  { value: "cluster", label: "Cluster" },
  { value: "sentinel", label: "Sentinel" },
];

interface Props {
  initial?: ConnectionProfile | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ConnectionForm({ initial, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ConnectionProfile>({
    ...EMPTY,
    ...(initial ?? {}),
    mode: initial?.mode ?? "standalone",
    nodes: initial?.nodes ?? [],
  });
  const [nodesText, setNodesText] = useState((initial?.nodes ?? []).join("\n"));
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof ConnectionProfile>(
    key: K,
    value: ConnectionProfile[K]
  ) => setForm((f) => ({ ...f, [key]: value }));

  const parseNodes = (text: string): string[] =>
    text
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const build = (): ConnectionProfile => ({
    ...form,
    name: form.name.trim() || (form.mode === "standalone" ? `${form.host}:${form.port}` : form.mode),
    nodes: parseNodes(nodesText),
  });

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const version = await api.testConnection(build());
      setTestResult(`✓ Connected${version ? ` — Redis ${version}` : ""}`);
    } catch (e) {
      setTestResult(`✗ ${String(e)}`);
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.saveConnection(build());
      onSaved();
      onClose();
    } catch (e) {
      setTestResult(`✗ ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const isCluster = form.mode === "cluster";
  const isSentinel = form.mode === "sentinel";
  const usesNodes = isCluster || isSentinel;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{initial ? "Edit connection" : "New connection"}</h2>
        <div className="form-grid">
          <div className="two">
            <div>
              <label>Name</label>
              <input
                value={form.name}
                placeholder="My Redis"
                onChange={(e) => update("name", e.target.value)}
                style={{ width: "100%" }}
                autoFocus
              />
            </div>
            <div>
              <label>Mode</label>
              <select
                value={form.mode}
                onChange={(e) => update("mode", e.target.value as ConnectionMode)}
                style={{ width: "100%" }}
              >
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!usesNodes && (
            <div className="two">
              <div>
                <label>Host</label>
                <input
                  value={form.host}
                  onChange={(e) => update("host", e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label>Port</label>
                <input
                  type="number"
                  value={form.port}
                  onChange={(e) => update("port", Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>
            </div>
          )}

          {usesNodes && (
            <div>
              <label>
                {isCluster ? "Cluster seed nodes" : "Sentinel nodes"} (one
                host:port per line)
              </label>
              <textarea
                value={nodesText}
                placeholder={"127.0.0.1:7000\n127.0.0.1:7001\n127.0.0.1:7002"}
                onChange={(e) => setNodesText(e.target.value)}
                style={{ width: "100%", minHeight: 78 }}
              />
            </div>
          )}

          {isSentinel && (
            <div>
              <label>Master group name</label>
              <input
                value={form.sentinelMaster ?? ""}
                placeholder="mymaster"
                onChange={(e) => update("sentinelMaster", e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
          )}

          <div className="two">
            <div>
              <label>Username (optional)</label>
              <input
                value={form.username ?? ""}
                onChange={(e) => update("username", e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label>Password (optional)</label>
              <input
                type="password"
                value={form.password ?? ""}
                onChange={(e) => update("password", e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <div className="two">
            {!isCluster && (
              <div>
                <label>Default DB</label>
                <input
                  type="number"
                  min={0}
                  value={form.db}
                  onChange={(e) => update("db", Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>
            )}
            <div>
              <label>TLS</label>
              <label className="row" style={{ marginTop: 6 }}>
                <input
                  type="checkbox"
                  checked={form.useTls}
                  onChange={(e) => update("useTls", e.target.checked)}
                />
                <span className="muted">Use TLS (rediss://)</span>
              </label>
            </div>
          </div>

          {form.mode === "standalone" && (
            <div
              style={{
                borderTop: "1px solid var(--border)",
                paddingTop: 12,
                marginTop: 2,
              }}
            >
              <label className="row" style={{ marginBottom: form.useSsh ? 12 : 0 }}>
                <input
                  type="checkbox"
                  checked={form.useSsh}
                  onChange={(e) => update("useSsh", e.target.checked)}
                />
                <span className="muted">Connect via SSH tunnel</span>
              </label>

              {form.useSsh && (
                <div className="form-grid">
                  <div className="two">
                    <div>
                      <label>SSH host</label>
                      <input
                        value={form.sshHost ?? ""}
                        placeholder="bastion.example.com"
                        onChange={(e) => update("sshHost", e.target.value)}
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label>SSH port</label>
                      <input
                        type="number"
                        value={form.sshPort ?? 22}
                        onChange={(e) => update("sshPort", Number(e.target.value))}
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>
                  <div>
                    <label>SSH username</label>
                    <input
                      value={form.sshUser ?? ""}
                      onChange={(e) => update("sshUser", e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label>SSH password (leave empty to use a key)</label>
                    <input
                      type="password"
                      value={form.sshPassword ?? ""}
                      onChange={(e) => update("sshPassword", e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label>SSH private key (PEM, optional)</label>
                    <textarea
                      value={form.sshPrivateKey ?? ""}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                      onChange={(e) => update("sshPrivateKey", e.target.value)}
                      style={{ width: "100%", minHeight: 70 }}
                    />
                  </div>
                  <div>
                    <label>Key passphrase (optional)</label>
                    <input
                      type="password"
                      value={form.sshPassphrase ?? ""}
                      onChange={(e) => update("sshPassphrase", e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {testResult && (
          <div
            className="mono"
            style={{
              marginTop: 14,
              color: testResult.startsWith("✓") ? "var(--green)" : "#ff8a80",
            }}
          >
            {testResult}
          </div>
        )}

        <div className="modal-actions">
          <button className="ghost" onClick={test} disabled={testing}>
            {testing ? "Testing…" : "Test connection"}
          </button>
          <div className="spacer" />
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
