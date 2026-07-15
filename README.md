# Rust Redis

A fast, lightweight **Redis GUI client** — a native alternative to Redis Insight,
built with **Tauri v2** (Rust backend) + **React / TypeScript** (frontend).

Because the backend is Rust and the shell is Tauri (system WebView instead of a
bundled Chromium), the app starts fast and uses a fraction of the memory of an
Electron-based tool.

## Features (v0.1 — MVP)

- 🔌 **Connection manager** — save multiple servers (host/port/user/password/db/TLS),
  test before connecting, persisted to disk.
- 🗄️ **Database switching** with live key counts per DB.
- 🔎 **Key browser** — non-blocking `SCAN` with pattern filter and infinite scroll.
- 🧬 **Typed value viewers/editors** for `string`, `list`, `set`, `hash`, `zset`.
- ✏️ **Key operations** — create, rename, set TTL, delete; inline element editing.
- ⌨️ **Built-in CLI** — run arbitrary Redis commands with history.

## Prerequisites

- **Rust** (stable) and **Node.js**.
- **Linux system dependencies** for Tauri (Ubuntu/Debian):

  ```bash
  sudo apt update && sudo apt install -y \
    libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

## Development

```bash
npm install          # install frontend deps (once)
npm run tauri dev    # launch the app with hot-reload
```

## Build a release binary

```bash
npm run tauri build
```

The bundled app (AppImage/deb on Linux) lands in `src-tauri/target/release/bundle/`.

## Project layout

```
src/                     React + TypeScript frontend
  api.ts                 typed wrappers over Tauri commands
  store.ts               zustand app state
  components/            UI (connections, key list, value editors, CLI)
src-tauri/               Rust backend
  src/commands.rs        #[tauri::command] handlers (the IPC surface)
  src/redis_client.rs    redis operations (SCAN, typed reads, writes, raw CLI)
  src/models.rs          serde types shared with the frontend
  src/store.rs           connection-profile persistence
scripts/gen-icons.mjs    dependency-free placeholder icon generator
```

## Roadmap

- Stream (`XRANGE`) viewer, Pub/Sub monitor, SlowLog, server INFO dashboard
- Cluster & Sentinel support, SSH tunneling
- JSON / msgpack value formatters, memory analysis
