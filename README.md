# Rust Redis

A fast, lightweight **Redis GUI client** — a native alternative to Redis Insight,
built with **Tauri v2** (Rust backend) + **React / TypeScript** (frontend).

Because the backend is Rust and the shell is Tauri (the OS WebView instead of a
bundled Chromium), the app starts fast and uses a fraction of the memory of an
Electron-based tool.

> Replace `ntdat104/rust-redis` throughout this file with your actual
> `<owner>/<repo>` once the repository is published.

---

## Features

- 🔌 **Connection manager** — save multiple servers; test before connecting; supports
  **standalone, Redis Cluster, and Sentinel**, optional **TLS** and **SSH tunnel**.
- 🗄️ **Database switching** with live key counts.
- 🔎 **Key browser** — non-blocking `SCAN` with pattern filter and infinite scroll
  (**cluster-wide** scan across all master nodes).
- 🧬 **Typed viewers/editors** for `string`, `list`, `set`, `hash`, `zset`, `stream`,
  with a built-in **JSON formatter** (pretty / minify / syntax highlight).
- ✏️ **Key operations** — create, rename, TTL, delete, per-element edit/delete,
  and **memory usage** per key.
- 📊 **Server Info dashboard**, 🐢 **Slow Log**, 📡 **Pub/Sub monitor**, 🕸 **Cluster view**
  — with Redis-Insight-style auto-refresh.
- ⌨️ **Built-in CLI** with command history.

---

## Install

Download the latest installer for your OS from the
**[Releases page](https://github.com/ntdat104/rust-redis/releases/latest)**.

| OS | Download | 
| --- | --- |
| **macOS** (Intel + Apple Silicon) | [`.dmg`](https://github.com/ntdat104/rust-redis/releases/latest) |
| **Linux** | [`.AppImage`](https://github.com/ntdat104/rust-redis/releases/latest) · [`.deb`](https://github.com/ntdat104/rust-redis/releases/latest) · [`.rpm`](https://github.com/ntdat104/rust-redis/releases/latest) |
| **Windows** | [`.exe`](https://github.com/ntdat104/rust-redis/releases/latest) · [`.msi`](https://github.com/ntdat104/rust-redis/releases/latest) |

> The app is currently **unsigned**, so each OS shows a first-run warning. The
> steps below explain how to open it anyway.

### macOS

1. Open the `.dmg` and drag **Rust Redis** into **Applications**.
2. First launch: **right-click the app → Open → Open** (bypasses Gatekeeper for
   the unsigned build). If macOS still blocks it:
   ```bash
   xattr -dr com.apple.quarantine "/Applications/Rust Redis.app"
   ```

### Linux

**AppImage** (works on most distros):

```bash
chmod +x rust-redis_*_amd64.AppImage
./rust-redis_*_amd64.AppImage
```

**Debian / Ubuntu (.deb):**

```bash
sudo apt install ./rust-redis_*_amd64.deb
```

**Fedora / RHEL (.rpm):**

```bash
sudo dnf install ./rust-redis-*.x86_64.rpm
```

> If the AppImage complains about FUSE on newer distros, run it with
> `./rust-redis_*.AppImage --appimage-extract-and-run`.

### Windows

1. Run the `.exe` (NSIS) **or** `.msi` installer.
2. On the "Windows protected your PC" SmartScreen prompt, click
   **More info → Run anyway** (needed for the unsigned build).

WebView2 is preinstalled on Windows 10/11; the installer fetches it otherwise.

### Docker (Linux host, GUI via X11)

The GUI renders through your host's X server, so this is intended for a **Linux
host** (macOS/Windows need XQuartz/VcXsrv).

```bash
# Build the image
docker build -t rust-redis .

# Allow the container to use your X server, then run it
xhost +local:docker
docker run --rm \
  -e DISPLAY=$DISPLAY \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  --net=host \
  rust-redis
```

`--net=host` lets the app reach a Redis running on `localhost` of the host.
A prebuilt image is also published to `ghcr.io/ntdat104/rust-redis` (see below).

```bash
docker run --rm -e DISPLAY=$DISPLAY -v /tmp/.X11-unix:/tmp/.X11-unix --net=host \
  ghcr.io/ntdat104/rust-redis:latest
```

---

## Quick start

1. Launch the app.
2. Click **+ New connection**, enter host/port (default `127.0.0.1:6379`) — or
   choose **Cluster / Sentinel**, or enable an **SSH tunnel**.
3. **Test connection**, then **Save** and **Connect**.

Need a local Redis to try it against?

```bash
docker run --rm -p 6379:6379 redis
```

---

## Build from source

Prerequisites: **Rust** (stable) and **Node.js 18+**.

**Linux system dependencies** (Ubuntu/Debian):

```bash
sudo apt update && sudo apt install -y \
  libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

macOS needs Xcode Command Line Tools (`xcode-select --install`); Windows needs
the Microsoft C++ Build Tools.

```bash
npm install          # install frontend deps (once)
npm run tauri dev    # run with hot-reload
npm run tauri build  # produce a release bundle in src-tauri/target/release/bundle/
```

---

## Project layout

```
src/                     React + TypeScript frontend
  api.ts                 typed wrappers over Tauri commands
  store.ts               zustand app state
  useResource.ts         cached (stale-while-revalidate) tab data
  components/            UI (connections, key list, value editors, CLI, dashboards)
src-tauri/               Rust backend
  src/commands.rs        #[tauri::command] handlers (the IPC surface)
  src/redis_client.rs    redis operations (SCAN, typed reads, writes, cluster, CLI)
  src/ssh_tunnel.rs      SSH local port-forwarding (russh)
  src/models.rs          serde types shared with the frontend
Dockerfile               containerized Linux build
.github/workflows/       CI that builds & publishes releases
```

---

## Releasing

See **[RELEASING.md](./RELEASING.md)** for how to cut a versioned GitHub Release
with installers for all platforms (automated via GitHub Actions).

---

## License

MIT
