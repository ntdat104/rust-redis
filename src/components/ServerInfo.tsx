import { api } from "../api";
import { useStore } from "../store";
import { useCachedResource } from "../useResource";
import { RefreshControl } from "./RefreshControl";
import type { InfoSection } from "../types";

function findValue(sections: InfoSection[], key: string): string | undefined {
  for (const s of sections) {
    const e = s.entries.find((e) => e.key === key);
    if (e) return e.value;
  }
  return undefined;
}

function formatUptime(seconds: string | undefined): string {
  const s = Number(seconds ?? 0);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function ServerInfo() {
  const activeId = useStore((s) => s.activeId)!;
  const setError = useStore((s) => s.setError);

  const { data, loading, lastUpdated, refresh } = useCachedResource(
    `${activeId}:serverInfo`,
    () => api.serverInfo(activeId),
    setError
  );
  const sections = data ?? [];

  const hits = Number(findValue(sections, "keyspace_hits") ?? 0);
  const misses = Number(findValue(sections, "keyspace_misses") ?? 0);
  const hitRate =
    hits + misses > 0 ? ((hits / (hits + misses)) * 100).toFixed(1) + "%" : "—";

  const stats = [
    { label: "Version", value: findValue(sections, "redis_version") ?? "—" },
    { label: "Uptime", value: formatUptime(findValue(sections, "uptime_in_seconds")) },
    { label: "Memory used", value: findValue(sections, "used_memory_human") ?? "—" },
    { label: "Peak memory", value: findValue(sections, "used_memory_peak_human") ?? "—" },
    { label: "Clients", value: findValue(sections, "connected_clients") ?? "—" },
    {
      label: "Ops/sec",
      value: findValue(sections, "instantaneous_ops_per_sec") ?? "—",
    },
    {
      label: "Total commands",
      value: Number(
        findValue(sections, "total_commands_processed") ?? 0
      ).toLocaleString(),
    },
    { label: "Hit rate", value: hitRate },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <h2>Server Info</h2>
        <div className="spacer" />
        <RefreshControl
          loading={loading}
          lastUpdated={lastUpdated}
          onRefresh={refresh}
          defaultMs={5000}
        />
      </div>

      {sections.length === 0 ? (
        <div className="faint" style={{ padding: 20 }}>
          {loading ? "Loading…" : "No data."}
        </div>
      ) : (
        <>
          <div className="stat-grid">
            {stats.map((s) => (
              <div className="stat-card" key={s.label}>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value">{s.value}</div>
              </div>
            ))}
          </div>

          <div className="info-sections">
            {sections.map((s) => (
              <div className="info-section" key={s.name}>
                <h3>{s.name}</h3>
                <table className="kv-table">
                  <tbody>
                    {s.entries.map((e) => (
                      <tr key={e.key}>
                        <td className="faint" style={{ width: "45%" }}>
                          {e.key}
                        </td>
                        <td>{e.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
