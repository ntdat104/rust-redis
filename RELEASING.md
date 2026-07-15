# Releasing

This guide explains how to cut a versioned GitHub Release for **Rust Redis**
with downloadable installers for macOS, Linux and Windows — the same shape as a
typical Tauri app release.

> Replace `ntdat104/rust-redis` below with your actual `<owner>/<repo>`.

---

## What a release contains

`npm run tauri build` (and the CI workflow) produce these artifacts per OS:

| Platform | Files | Notes |
| --- | --- | --- |
| **macOS** | `Rust Redis_<version>_universal.dmg`, `Rust Redis.app.tar.gz` | Universal (Intel + Apple Silicon) |
| **Linux** | `rust-redis_<version>_amd64.AppImage`, `rust-redis_<version>_amd64.deb`, `rust-redis-<version>-1.x86_64.rpm` | AppImage runs anywhere; deb/rpm for package managers |
| **Windows** | `Rust Redis_<version>_x64-setup.exe` (NSIS), `Rust Redis_<version>_x64_en-US.msi` | Either installer works |

Each file may be accompanied by a `.sig` when updater signing is enabled.

Local build output lands in `src-tauri/target/release/bundle/`.

---

## 1. Bump the version

Keep the version identical in **all three** files:

- `package.json` → `"version"`
- `src-tauri/tauri.conf.json` → `"version"`
- `src-tauri/Cargo.toml` → `[package] version`

```bash
# example: releasing 0.2.0
# edit the three files, then:
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: release v0.2.0"
```

---

## 2. Tag and push (triggers CI)

```bash
git tag v0.2.0
git push origin master
git push origin v0.2.0
```

The push of a `v*` tag starts `.github/workflows/release.yml`, which builds on
macOS, Ubuntu and Windows runners in parallel and creates a **draft** GitHub
Release with every installer attached.

You can also start it manually from **Actions → Release → Run workflow**.

---

## 3. Publish

1. Open **Releases** on GitHub → find the new **Draft**.
2. Verify all assets uploaded (macOS `.dmg`, Linux `.AppImage`/`.deb`/`.rpm`,
   Windows `.exe`/`.msi`).
3. Write/paste the changelog in the body.
4. Click **Publish release**.

After publishing, update the download links in `README.md` (they point at
`releases/latest`, so they usually keep working automatically).

---

## Building locally (no CI)

You can only build for the OS you are currently on — cross-compiling desktop
bundles is impractical, which is why CI does all three.

```bash
npm install
npm run tauri build
```

Prerequisites per OS:

- **Linux**: the system packages listed in `README.md` (webkit2gtk etc.).
- **macOS**: Xcode Command Line Tools (`xcode-select --install`).
- **Windows**: the [Microsoft C++ Build Tools] and WebView2 (preinstalled on
  Windows 10/11).

[Microsoft C++ Build Tools]: https://visualstudio.microsoft.com/visual-cpp-build-tools/

---

## Monorepo note

If this app stays inside the `rust-lang` monorepo (not its own repo):

1. Move `.github/workflows/release.yml` to the **repository root** `.github/workflows/`.
2. Uncomment `projectPath: ./rust_redis` in the `tauri-action` step.
3. Change `run: npm ci` to run inside the app dir, e.g.
   `working-directory: ./rust_redis`.

---

## Optional: code signing & notarization

Unsigned apps still work but show OS warnings (see README install notes). To
sign, add these repository **Secrets** and uncomment the matching `env:` lines
in the workflow:

- **macOS**: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`.
- **Windows**: configure a signing certificate per the Tauri docs.
- **Auto-updater**: generate a keypair with `npm run tauri signer generate`,
  then add `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

See the official docs: <https://tauri.app/distribute/>

---

## Optional: Docker image

To also publish a container image (Linux GUI via X11 — see README):

```bash
docker build -t ghcr.io/ntdat104/rust-redis:0.2.0 -t ghcr.io/ntdat104/rust-redis:latest .
echo "$GH_TOKEN" | docker login ghcr.io -u ntdat104 --password-stdin
docker push ghcr.io/ntdat104/rust-redis:0.2.0
docker push ghcr.io/ntdat104/rust-redis:latest
```

---

## Release checklist

- [ ] Version bumped in the three files and committed
- [ ] `npm run build` and `cargo check` pass
- [ ] Tag `vX.Y.Z` pushed
- [ ] CI green; all installers attached to the draft
- [ ] Changelog written
- [ ] Release published
- [ ] `README.md` download links verified
