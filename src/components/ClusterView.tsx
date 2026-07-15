import { api } from "../api";
import { useStore } from "../store";
import { useCachedResource } from "../useResource";
import { RefreshControl } from "./RefreshControl";

export function ClusterView() {
  const activeId = useStore((s) => s.activeId)!;
  const setError = useStore((s) => s.setError);

  const { data, loading, lastUpdated, refresh } = useCachedResource(
    `${activeId}:clusterNodes`,
    () => api.clusterNodes(activeId),
    setError
  );
  const nodes = data ?? [];

  const masters = nodes.filter((n) => n.role === "master").length;
  const replicas = nodes.length - masters;

  return (
    <div className="page">
      <div className="page-head">
        <h2>Cluster</h2>
        <span className="badge">{masters} masters</span>
        <span className="badge">{replicas} replicas</span>
        <div className="spacer" />
        <RefreshControl
          loading={loading}
          lastUpdated={lastUpdated}
          onRefresh={refresh}
          defaultMs={5000}
        />
      </div>

      {nodes.length === 0 ? (
        <div className="faint" style={{ padding: 20 }}>
          {loading ? "Loading…" : "No cluster nodes reported."}
        </div>
      ) : (
        <table className="kv-table">
          <thead>
            <tr>
              <th style={{ width: 90 }}>Role</th>
              <th style={{ width: 170 }}>Address</th>
              <th style={{ width: 120 }}>Slots</th>
              <th>Flags</th>
              <th style={{ width: 90 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((n) => (
              <tr key={n.id}>
                <td>
                  <span
                    className={`type-badge ${
                      n.role === "master" ? "type-zset" : "type-string"
                    }`}
                  >
                    {n.role}
                  </span>
                </td>
                <td>{n.addr}</td>
                <td>{n.slots || "—"}</td>
                <td className="faint">{n.flags}</td>
                <td style={{ color: n.connected ? "var(--green)" : "#ff8a80" }}>
                  {n.connected ? "connected" : "down"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
