import { useEffect, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import type { ConnectionProfile } from "../types";
import { confirmDialog } from "../dialogs";
import { ConnectionForm } from "./ConnectionForm";

export function ConnectionsView() {
  const connections = useStore((s) => s.connections);
  const loadConnections = useStore((s) => s.loadConnections);
  const connect = useStore((s) => s.connect);
  const busy = useStore((s) => s.busy);

  const [editing, setEditing] = useState<ConnectionProfile | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const openNew = () => {
    setEditing(null);
    setShowForm(true);
  };
  const openEdit = (c: ConnectionProfile) => {
    setEditing(c);
    setShowForm(true);
  };
  const remove = async (id: string) => {
    if (!(await confirmDialog("Delete this connection?"))) return;
    await api.deleteConnection(id);
    await loadConnections();
  };

  return (
    <div className="connections">
      <h1>
        <span style={{ color: "var(--accent)" }}>◆</span> Rust Redis
      </h1>
      <div className="sub">
        A fast, lightweight Redis GUI — pick a connection to get started.
      </div>

      <div className="conn-grid">
        {connections.map((c) => (
          <div className="conn-card" key={c.id}>
            <div className="name">{c.name}</div>
            <div className="addr">
              {c.useTls ? "rediss" : "redis"}://{c.host}:{c.port} · db{c.db}
            </div>
            <div className="actions">
              <button
                className="primary small"
                disabled={busy}
                onClick={() => connect(c.id)}
              >
                Connect
              </button>
              <button className="small ghost" onClick={() => openEdit(c)}>
                Edit
              </button>
              <div className="spacer" />
              <button
                className="small ghost danger"
                onClick={() => remove(c.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        <div className="conn-card add" onClick={openNew}>
          + New connection
        </div>
      </div>

      {showForm && (
        <ConnectionForm
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={loadConnections}
        />
      )}
    </div>
  );
}
