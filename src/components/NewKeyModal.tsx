import { useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import { KEY_TYPES } from "../types";

export function NewKeyModal({ onClose }: { onClose: () => void }) {
  const activeId = useStore((s) => s.activeId)!;
  const startScan = useStore((s) => s.startScan);
  const selectKey = useStore((s) => s.selectKey);
  const setError = useStore((s) => s.setError);

  const [key, setKey] = useState("");
  const [type, setType] = useState<string>("string");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!key.trim()) return;
    setSaving(true);
    try {
      await api.createKey(activeId, key.trim(), type);
      await startScan();
      await selectKey(key.trim());
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>New key</h2>
        <div className="form-grid">
          <div>
            <label>Key name</label>
            <input
              value={key}
              autoFocus
              placeholder="user:1000"
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label>Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              style={{ width: "100%" }}
            >
              {KEY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="faint" style={{ fontSize: 12 }}>
            The key is created with a placeholder element (Redis cannot store
            empty collections).
          </div>
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={create} disabled={saving}>
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
