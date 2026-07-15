// Mirrors the Rust models serialized across the Tauri IPC boundary.

export type ConnectionMode = "standalone" | "cluster" | "sentinel";

export interface ConnectionProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
  db: number;
  useTls: boolean;
  mode: ConnectionMode;
  /** Seed nodes ("host:port") for cluster, or sentinel addresses. */
  nodes: string[];
  /** Master group name for sentinel mode. */
  sentinelMaster?: string | null;
  // SSH tunnel (standalone mode)
  useSsh: boolean;
  sshHost?: string | null;
  sshPort?: number | null;
  sshUser?: string | null;
  sshPassword?: string | null;
  sshPrivateKey?: string | null;
  sshPassphrase?: string | null;
}

export interface ClusterNode {
  id: string;
  addr: string;
  role: string;
  flags: string;
  masterId: string | null;
  slots: string;
  connected: boolean;
}

export interface KeyInfo {
  key: string;
  type: string;
}

export interface ScanResult {
  cursor: string;
  keys: KeyInfo[];
}

export interface HashField {
  field: string;
  value: string;
}

export interface ZSetMember {
  member: string;
  score: number;
}

export interface StreamEntry {
  id: string;
  fields: HashField[];
}

export type RedisValue =
  | { type: "string"; value: string }
  | { type: "list"; items: string[] }
  | { type: "set"; members: string[] }
  | { type: "hash"; fields: HashField[] }
  | { type: "zset"; members: ZSetMember[] }
  | { type: "stream"; length: number; entries: StreamEntry[] }
  | { type: "none" };

export interface KeyDetail {
  key: string;
  type: string;
  ttl: number;
  size: number;
  memory: number | null;
  value: RedisValue;
}

export interface DatabaseInfo {
  index: number;
  keys: number;
}

export interface ConnectionSummary {
  id: string;
  currentDb: number;
  databaseCount: number;
  databases: DatabaseInfo[];
  serverVersion: string;
}

export interface InfoEntry {
  key: string;
  value: string;
}

export interface InfoSection {
  name: string;
  entries: InfoEntry[];
}

export interface SlowLogEntry {
  id: number;
  timestamp: number;
  durationUs: number;
  command: string;
  clientAddr: string;
  clientName: string;
}

export interface PubSubMessage {
  connectionId: string;
  channel: string;
  pattern: string | null;
  payload: string;
}

export const KEY_TYPES = ["string", "list", "set", "hash", "zset"] as const;
export type KeyType = (typeof KEY_TYPES)[number];
