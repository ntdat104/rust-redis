import { api } from "../api";
import { useStore } from "../store";
import { confirmDialog } from "../dialogs";
import { useCachedResource } from "../useResource";
import { RefreshControl } from "./RefreshControl";

export function SlowLog() {
  const activeId = useStore((s) => s.activeId)!;
  const setError = useStore((s) => s.setError);

  const { data, loading, lastUpdated, refresh } = useCachedResource(
    `${activeId}:slowLog`,
    () => api.slowLog(activeId, 128),
    setError
  );
  const entries = data ?? [];

  const reset = async () => {
    if (!(await confirmDialog("Clear the slow log?"))) return;
    try {
      await api.slowLogReset(activeId);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>Slow Log</h2>
        <div className="spacer" />
        <button className="small ghost danger" onClick={reset}>
          Clear
        </button>
        <RefreshControl
          loading={loading}
          lastUpdated={lastUpdated}
          onRefresh={refresh}
          defaultMs={0}
        />
      </div>

      {entries.length === 0 ? (
        <div className="faint" style={{ padding: 20 }}>
          {loading ? "Loading…" : "No slow commands logged 🎉"}
        </div>
      ) : (
        <table className="kv-table">
          <thead>
            <tr>
              <th style={{ width: 60 }}>#</th>
              <th style={{ width: 170 }}>Time</th>
              <th style={{ width: 110 }}>Duration</th>
              <th>Command</th>
              <th style={{ width: 150 }}>Client</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="faint">{e.id}</td>
                <td>{new Date(e.timestamp * 1000).toLocaleString()}</td>
                <td
                  style={{
                    color: e.durationUs > 10000 ? "#ff8a80" : "var(--yellow)",
                  }}
                >
                  {(e.durationUs / 1000).toFixed(2)} ms
                </td>
                <td>{e.command}</td>
                <td className="faint">{e.clientAddr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
