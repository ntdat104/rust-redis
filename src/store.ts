import { create } from "zustand";
import { api } from "./api";
import { clearResourceCache, prefetchResource } from "./useResource";
import type {
  ConnectionProfile,
  ConnectionSummary,
  KeyDetail,
  KeyInfo,
} from "./types";

const SCAN_COUNT = 300;

interface AppState {
  // connection profiles
  connections: ConnectionProfile[];

  // active live connection
  activeId: string | null;
  summary: ConnectionSummary | null;
  db: number;
  dbSize: number;

  // key browsing
  pattern: string;
  keys: KeyInfo[];
  cursor: string;
  scanning: boolean;
  scanComplete: boolean;

  // selection
  selectedKey: string | null;
  detail: KeyDetail | null;
  loadingDetail: boolean;

  error: string | null;
  busy: boolean;

  // ---- actions ----
  loadConnections: () => Promise<void>;
  connect: (id: string) => Promise<void>;
  disconnect: () => Promise<void>;
  selectDb: (db: number) => Promise<void>;
  refreshDbSize: () => Promise<void>;

  startScan: (pattern?: string) => Promise<void>;
  loadMore: () => Promise<void>;

  selectKey: (key: string | null) => Promise<void>;
  refreshDetail: () => Promise<void>;

  setError: (msg: string | null) => void;
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
}

export const useStore = create<AppState>((set, get) => ({
  connections: [],
  activeId: null,
  summary: null,
  db: 0,
  dbSize: 0,
  pattern: "*",
  keys: [],
  cursor: "0",
  scanning: false,
  scanComplete: false,
  selectedKey: null,
  detail: null,
  loadingDetail: false,
  error: null,
  busy: false,

  setError: (msg) => set({ error: msg }),

  // Run an async op, surfacing any error to the global error banner.
  run: async (fn) => {
    try {
      return await fn();
    } catch (e) {
      set({ error: String(e) });
      return undefined;
    }
  },

  loadConnections: async () => {
    await get().run(async () => {
      const connections = await api.listConnections();
      set({ connections });
    });
  },

  connect: async (id) => {
    set({ busy: true });
    await get().run(async () => {
      const summary = await api.openConnection(id);
      set({
        activeId: id,
        summary,
        db: summary.currentDb,
        selectedKey: null,
        detail: null,
      });
      await get().startScan("*");
      await get().refreshDbSize();

      // Warm the diagnostic tabs' caches in the background so switching to them
      // shows data instantly (never blocks on the first request).
      const profile = get().connections.find((c) => c.id === id);
      void prefetchResource(`${id}:serverInfo`, () => api.serverInfo(id));
      void prefetchResource(`${id}:slowLog`, () => api.slowLog(id, 128));
      if (profile?.mode === "cluster") {
        void prefetchResource(`${id}:clusterNodes`, () => api.clusterNodes(id));
      }
    });
    set({ busy: false });
  },

  disconnect: async () => {
    const { activeId } = get();
    if (!activeId) return;
    await get().run(() => api.closeConnection(activeId));
    clearResourceCache();
    set({
      activeId: null,
      summary: null,
      keys: [],
      selectedKey: null,
      detail: null,
      cursor: "0",
      dbSize: 0,
    });
  },

  selectDb: async (db) => {
    const { activeId } = get();
    if (!activeId) return;
    await get().run(async () => {
      const summary = await api.selectDatabase(activeId, db);
      set({ summary, db, selectedKey: null, detail: null });
      await get().startScan(get().pattern);
      await get().refreshDbSize();
    });
  },

  refreshDbSize: async () => {
    const { activeId } = get();
    if (!activeId) return;
    const size = await get().run(() => api.dbSize(activeId));
    if (typeof size === "number") set({ dbSize: size });
  },

  startScan: async (pattern) => {
    const { activeId } = get();
    if (!activeId) return;
    const p = pattern ?? get().pattern;
    set({ scanning: true, keys: [], cursor: "0", scanComplete: false, pattern: p });
    await get().run(async () => {
      const res = await api.scanKeys(activeId, normalizePattern(p), "0", SCAN_COUNT);
      set({
        keys: res.keys,
        cursor: res.cursor,
        scanComplete: res.cursor === "0",
      });
    });
    set({ scanning: false });
  },

  loadMore: async () => {
    const { activeId, cursor, scanComplete, scanning, pattern } = get();
    if (!activeId || scanComplete || scanning) return;
    set({ scanning: true });
    await get().run(async () => {
      const res = await api.scanKeys(
        activeId,
        normalizePattern(pattern),
        cursor,
        SCAN_COUNT
      );
      set((s) => ({
        keys: [...s.keys, ...res.keys],
        cursor: res.cursor,
        scanComplete: res.cursor === "0",
      }));
    });
    set({ scanning: false });
  },

  selectKey: async (key) => {
    set({ selectedKey: key, detail: null });
    if (key) await get().refreshDetail();
  },

  refreshDetail: async () => {
    const { activeId, selectedKey } = get();
    if (!activeId || !selectedKey) return;
    set({ loadingDetail: true });
    await get().run(async () => {
      const detail = await api.getKeyDetail(activeId, selectedKey);
      set({ detail });
    });
    set({ loadingDetail: false });
  },
}));

function normalizePattern(p: string): string {
  const t = p.trim();
  return t === "" ? "*" : t;
}
