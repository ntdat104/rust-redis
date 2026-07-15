export function formatTtl(ttl: number): string {
  if (ttl === -1) return "No expiry";
  if (ttl === -2) return "Expired";
  if (ttl < 60) return `${ttl}s`;
  if (ttl < 3600) return `${Math.floor(ttl / 60)}m ${ttl % 60}s`;
  if (ttl < 86400) {
    const h = Math.floor(ttl / 3600);
    const m = Math.floor((ttl % 3600) / 60);
    return `${h}h ${m}m`;
  }
  return `${Math.floor(ttl / 86400)}d`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatSize(type: string, size: number): string {
  if (type === "string") return `${size} B`;
  const unit =
    type === "hash"
      ? "fields"
      : type === "zset" || type === "set"
        ? "members"
        : "items";
  return `${size} ${unit}`;
}
