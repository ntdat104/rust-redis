import { invoke } from "@tauri-apps/api/core";
import type {
  ClusterNode,
  ConnectionProfile,
  ConnectionSummary,
  InfoSection,
  KeyDetail,
  ScanResult,
  SlowLogEntry,
} from "./types";

// Thin, typed wrappers over the Rust `#[tauri::command]` handlers.
// Tauri maps camelCase JS args to snake_case Rust parameters automatically.
export const api = {
  // profiles
  listConnections: () => invoke<ConnectionProfile[]>("list_connections"),
  saveConnection: (profile: ConnectionProfile) =>
    invoke<ConnectionProfile>("save_connection", { profile }),
  deleteConnection: (id: string) => invoke<void>("delete_connection", { id }),
  testConnection: (profile: ConnectionProfile) =>
    invoke<string>("test_connection", { profile }),

  // lifecycle
  openConnection: (id: string) =>
    invoke<ConnectionSummary>("open_connection", { id }),
  closeConnection: (id: string) => invoke<void>("close_connection", { id }),
  selectDatabase: (id: string, db: number) =>
    invoke<ConnectionSummary>("select_database", { id, db }),
  dbSize: (id: string) => invoke<number>("db_size", { id }),
  clusterNodes: (id: string) => invoke<ClusterNode[]>("cluster_nodes", { id }),

  // browsing
  scanKeys: (id: string, pattern: string, cursor: string, count: number) =>
    invoke<ScanResult>("scan_keys", { id, pattern, cursor, count }),
  getKeyDetail: (id: string, key: string) =>
    invoke<KeyDetail>("get_key_detail", { id, key }),

  // writes
  setStringValue: (id: string, key: string, value: string) =>
    invoke<void>("set_string_value", { id, key, value }),
  deleteKey: (id: string, key: string) =>
    invoke<boolean>("delete_key", { id, key }),
  renameKey: (id: string, from: string, to: string) =>
    invoke<void>("rename_key", { id, from, to }),
  setKeyTtl: (id: string, key: string, ttl: number) =>
    invoke<void>("set_key_ttl", { id, key, ttl }),
  createKey: (id: string, key: string, keyType: string) =>
    invoke<void>("create_key", { id, key, keyType }),
  hashSetField: (id: string, key: string, field: string, value: string) =>
    invoke<void>("hash_set_field", { id, key, field, value }),
  hashDeleteField: (id: string, key: string, field: string) =>
    invoke<void>("hash_delete_field", { id, key, field }),
  listPushValue: (id: string, key: string, value: string, left: boolean) =>
    invoke<void>("list_push_value", { id, key, value, left }),
  listSetValue: (id: string, key: string, index: number, value: string) =>
    invoke<void>("list_set_value", { id, key, index, value }),
  listDeleteIndex: (id: string, key: string, index: number) =>
    invoke<void>("list_delete_index", { id, key, index }),
  setAddMember: (id: string, key: string, member: string) =>
    invoke<void>("set_add_member", { id, key, member }),
  setRemoveMember: (id: string, key: string, member: string) =>
    invoke<void>("set_remove_member", { id, key, member }),
  zsetAddMember: (id: string, key: string, member: string, score: number) =>
    invoke<void>("zset_add_member", { id, key, member, score }),
  zsetRemoveMember: (id: string, key: string, member: string) =>
    invoke<void>("zset_remove_member", { id, key, member }),

  // diagnostics
  serverInfo: (id: string) => invoke<InfoSection[]>("server_info", { id }),
  slowLog: (id: string, count: number) =>
    invoke<SlowLogEntry[]>("slow_log", { id, count }),
  slowLogReset: (id: string) => invoke<void>("slow_log_reset", { id }),

  // pub/sub
  pubsubSubscribe: (id: string, channels: string[], patterns: string[]) =>
    invoke<void>("pubsub_subscribe", { id, channels, patterns }),
  pubsubUnsubscribe: (id: string) =>
    invoke<void>("pubsub_unsubscribe", { id }),

  // cli
  runCommand: (id: string, command: string) =>
    invoke<string>("run_command", { id, command }),
};
