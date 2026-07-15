# Rust Redis — containerized Linux build.
#
# Redis GUI is a desktop app, so the container renders through the host's X11
# server (Linux host). See the "Docker" section of README.md for run commands.

# ---------- frontend ----------
FROM node:20-bookworm AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build          # outputs /app/dist

# ---------- backend ----------
FROM rust:1-bookworm AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    libwebkit2gtk-4.1-dev \
    build-essential \
    curl wget file \
    libxdo-dev \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
COPY --from=frontend /app/dist ./dist
# Build the Rust binary with the web assets embedded.
RUN cargo build --release --features custom-protocol --manifest-path src-tauri/Cargo.toml

# ---------- runtime ----------
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libwebkit2gtk-4.1-0 \
    libgtk-3-0 \
    libayatana-appindicator3-1 \
    librsvg2-2 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/src-tauri/target/release/rust-redis /usr/local/bin/rust-redis

# Provided at runtime via `-e DISPLAY=$DISPLAY`.
ENV DISPLAY=:0
ENTRYPOINT ["/usr/local/bin/rust-redis"]
