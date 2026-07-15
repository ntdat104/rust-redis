import { useCallback, useEffect, useRef, useState } from "react";

// A tiny module-level cache enabling stale-while-revalidate: when a tab is
// re-opened we show the last known data instantly, then refresh in the
// background so the user never stares at a blank "Loading…" screen.

interface Entry {
  data: unknown;
  at: number;
}

const cache = new Map<string, Entry>();

/** Drop cached entries (all, or those under a key prefix). */
export function clearResourceCache(prefix?: string) {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/**
 * Warm the cache for a resource in the background (errors ignored). Call this
 * right after connecting so a tab shows data instantly on first open instead
 * of waiting for its first request.
 */
export async function prefetchResource<T>(
  key: string,
  fetcher: () => Promise<T>
): Promise<void> {
  try {
    const data = await fetcher();
    cache.set(key, { data, at: Date.now() });
  } catch {
    /* prefetch is best-effort */
  }
}

/**
 * Cached async resource. Returns the cached value immediately (if any) and
 * revalidates on mount and whenever `key` changes.
 */
export function useCachedResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  onError?: (e: string) => void
) {
  const existing = cache.get(key);
  const [data, setData] = useState<T | undefined>(existing?.data as T | undefined);
  const [lastUpdated, setLastUpdated] = useState<number | undefined>(existing?.at);
  const [loading, setLoading] = useState(false);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetcherRef.current();
      cache.set(key, { data: d, at: Date.now() });
      setData(d);
      setLastUpdated(Date.now());
    } catch (e) {
      onErrorRef.current?.(String(e));
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    // Show whatever is cached for this key immediately (never block the UI on a
    // request). Then revalidate in the background — unless the cache is very
    // fresh (e.g. just prefetched on connect), to avoid a redundant fetch.
    const c = cache.get(key);
    setData(c?.data as T | undefined);
    setLastUpdated(c?.at);
    if (!c || Date.now() - c.at > 2000) refresh();
  }, [key, refresh]);

  return { data, loading, lastUpdated, refresh };
}
