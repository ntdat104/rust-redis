import { useEffect, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import { confirmDialog } from "../dialogs";
import { formatBytes, formatSize, formatTtl } from "../utils";
import type { KeyDetail } from "../types";
import { isFormattableJson, minifyJson, prettyJson } from "../json";
import { TypeBadge } from "./TypeBadge";
import { PromptModal } from "./PromptModal";
import { JsonView, MaybeJson } from "./JsonView";

export function KeyView() {
  const detail = useStore((s) => s.detail);
  const selectedKey = useStore((s) => s.selectedKey);
  const loadingDetail = useStore((s) => s.loadingDetail);

  if (!selectedKey) {
    return (
      <div className="detail">
        <div className="empty">
          <div style={{ fontSize: 40, opacity: 0.4 }}>◆</div>
          <div>Select a key to view its value</div>
        </div>
      </div>
    );
  }

  if (loadingDetail || !detail) {
    return (
      <div className="detail">
        <div className="empty">Loading…</div>
      </div>
    );
  }

  return <KeyViewInner detail={detail} />;
}

function KeyViewInner({ detail }: { detail: KeyDetail }) {
  const activeId = useStore((s) => s.activeId)!;
  const refreshDetail = useStore((s) => s.refreshDetail);
  const startScan = useStore((s) => s.startScan);
  const selectKey = useStore((s) => s.selectKey);
  const setError = useStore((s) => s.setError);

  const [renaming, setRenaming] = useState(false);
  const [settingTtl, setSettingTtl] = useState(false);

  const guard = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refreshDetail();
    } catch (e) {
      setError(String(e));
    }
  };

  const remove = async () => {
    if (!(await confirmDialog(`Delete key "${detail.key}"?`))) return;
    try {
      await api.deleteKey(activeId, detail.key);
      await selectKey(null);
      await startScan();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="detail">
      <div className="header">
        <div className="row">
          <TypeBadge type={detail.type} />
          <span className="keyname">{detail.key}</span>
        </div>
        <div className="meta">
          <span>{formatSize(detail.type, detail.size)}</span>
          {detail.memory != null && <span>Memory: {formatBytes(detail.memory)}</span>}
          <span>TTL: {formatTtl(detail.ttl)}</span>
          <div className="spacer" />
          <button className="small ghost" onClick={() => refreshDetail()}>
            ↻ Refresh
          </button>
          <button className="small ghost" onClick={() => setSettingTtl(true)}>
            ⏱ TTL
          </button>
          <button className="small ghost" onClick={() => setRenaming(true)}>
            ✎ Rename
          </button>
          <button className="small ghost danger" onClick={remove}>
            🗑 Delete
          </button>
        </div>
      </div>

      <div className="body">
        <ValueEditor detail={detail} guard={guard} />
      </div>

      {renaming && (
        <PromptModal
          title="Rename key"
          label="New key name"
          initial={detail.key}
          submitLabel="Rename"
          onClose={() => setRenaming(false)}
          onSubmit={async (to) => {
            if (!to.trim() || to === detail.key) return;
            try {
              await api.renameKey(activeId, detail.key, to.trim());
              await selectKey(to.trim());
              await startScan();
            } catch (e) {
              setError(String(e));
            }
          }}
        />
      )}

      {settingTtl && (
        <PromptModal
          title="Set TTL"
          label="Seconds (0 or less = no expiry)"
          type="number"
          initial={String(detail.ttl > 0 ? detail.ttl : 0)}
          submitLabel="Apply"
          onClose={() => setSettingTtl(false)}
          onSubmit={(v) => guard(() => api.setKeyTtl(activeId, detail.key, Number(v)))}
        />
      )}
    </div>
  );
}

type Guard = (fn: () => Promise<unknown>) => Promise<void>;

function ValueEditor({ detail, guard }: { detail: KeyDetail; guard: Guard }) {
  const activeId = useStore((s) => s.activeId)!;
  const v = detail.value;

  switch (v.type) {
    case "string":
      return <StringEditor keyName={detail.key} value={v.value} guard={guard} />;
    case "hash":
      return (
        <HashEditor
          keyName={detail.key}
          fields={v.fields}
          activeId={activeId}
          guard={guard}
        />
      );
    case "list":
      return (
        <ListEditor
          keyName={detail.key}
          items={v.items}
          activeId={activeId}
          guard={guard}
        />
      );
    case "set":
      return (
        <SetEditor
          keyName={detail.key}
          members={v.members}
          activeId={activeId}
          guard={guard}
        />
      );
    case "zset":
      return (
        <ZSetEditor
          keyName={detail.key}
          members={v.members}
          activeId={activeId}
          guard={guard}
        />
      );
    case "stream":
      return <StreamViewer length={v.length} entries={v.entries} />;
    default:
      return <div className="muted">This key no longer exists.</div>;
  }
}

/* ---------- stream (read-only) ---------- */
function StreamViewer({
  length,
  entries,
}: {
  length: number;
  entries: { id: string; fields: { field: string; value: string }[] }[];
}) {
  return (
    <div>
      <div className="muted" style={{ marginBottom: 10 }}>
        {length} entries · showing {entries.length} most recent
      </div>
      <table className="kv-table">
        <thead>
          <tr>
            <th style={{ width: 200 }}>ID</th>
            <th>Fields</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td>{e.id}</td>
              <td>
                {e.fields.map((f) => (
                  <div key={f.field} style={{ marginBottom: 2 }}>
                    <span className="faint">{f.field}</span>:{" "}
                    <MaybeJson text={f.value} />
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- string (with JSON formatter) ---------- */
function StringEditor({
  keyName,
  value,
  guard,
}: {
  keyName: string;
  value: string;
  guard: Guard;
}) {
  const activeId = useStore((s) => s.activeId)!;
  const [text, setText] = useState(value);
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setText(value);
    setMode("preview");
  }, [value, keyName]);

  const dirty = text !== value;
  const isJson = isFormattableJson(text);
  const effectiveMode = isJson ? mode : "edit";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="string-editor">
      <div className="row" style={{ marginBottom: 10, flexWrap: "wrap" }}>
        {isJson && <span className="type-badge type-string">JSON</span>}
        {isJson && (
          <div className="seg">
            <button
              className={effectiveMode === "preview" ? "on" : ""}
              onClick={() => setMode("preview")}
            >
              Preview
            </button>
            <button
              className={effectiveMode === "edit" ? "on" : ""}
              onClick={() => setMode("edit")}
            >
              Edit
            </button>
          </div>
        )}
        <div className="spacer" />
        {isJson && effectiveMode === "edit" && (
          <>
            <button className="small ghost" onClick={() => setText(prettyJson(text))}>
              ⚟ Beautify
            </button>
            <button className="small ghost" onClick={() => setText(minifyJson(text))}>
              ⚞ Minify
            </button>
          </>
        )}
        <button className="small ghost" onClick={copy}>
          {copied ? "✓ Copied" : "⧉ Copy"}
        </button>
      </div>

      {effectiveMode === "preview" ? (
        <JsonView text={text} />
      ) : (
        <textarea value={text} onChange={(e) => setText(e.target.value)} />
      )}

      <div className="add-row">
        <button
          className="primary"
          disabled={!dirty}
          onClick={() => guard(() => api.setStringValue(activeId, keyName, text))}
        >
          Save
        </button>
        <button disabled={!dirty} onClick={() => setText(value)}>
          Reset
        </button>
        <div className="spacer" />
        <span className="faint" style={{ fontSize: 11 }}>
          {text.length.toLocaleString()} chars
        </span>
      </div>
    </div>
  );
}

/* ---------- inline editable cell ---------- */
function EditableCell({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <span
        className="editable"
        onDoubleClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="Double-click to edit"
      >
        {value}
      </span>
    );
  }
  return (
    <span className="row">
      <input
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        style={{ width: "100%" }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSave(draft);
            setEditing(false);
          }
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <button
        className="small primary"
        onClick={() => {
          onSave(draft);
          setEditing(false);
        }}
      >
        ✓
      </button>
    </span>
  );
}

/* ---------- hash ---------- */
function HashEditor({
  keyName,
  fields,
  activeId,
  guard,
}: {
  keyName: string;
  fields: { field: string; value: string }[];
  activeId: string;
  guard: Guard;
}) {
  const [nf, setNf] = useState("");
  const [nv, setNv] = useState("");

  return (
    <div>
      <table className="kv-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Value</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.field}>
              <td>{f.field}</td>
              <td>
                <EditableCell
                  value={f.value}
                  onSave={(val) =>
                    guard(() => api.hashSetField(activeId, keyName, f.field, val))
                  }
                />
              </td>
              <td className="actions">
                <button
                  className="small ghost danger"
                  onClick={() =>
                    guard(() => api.hashDeleteField(activeId, keyName, f.field))
                  }
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="add-row">
        <input
          placeholder="field"
          value={nf}
          onChange={(e) => setNf(e.target.value)}
        />
        <input
          placeholder="value"
          value={nv}
          onChange={(e) => setNv(e.target.value)}
        />
        <button
          className="primary"
          disabled={!nf}
          onClick={() =>
            guard(async () => {
              await api.hashSetField(activeId, keyName, nf, nv);
              setNf("");
              setNv("");
            })
          }
        >
          Add field
        </button>
      </div>
    </div>
  );
}

/* ---------- list ---------- */
function ListEditor({
  keyName,
  items,
  activeId,
  guard,
}: {
  keyName: string;
  items: string[];
  activeId: string;
  guard: Guard;
}) {
  const [nv, setNv] = useState("");

  return (
    <div>
      <table className="kv-table">
        <thead>
          <tr>
            <th className="idx-col">#</th>
            <th>Value</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td className="idx-col">{i}</td>
              <td>
                <EditableCell
                  value={item}
                  onSave={(val) =>
                    guard(() => api.listSetValue(activeId, keyName, i, val))
                  }
                />
              </td>
              <td className="actions">
                <button
                  className="small ghost danger"
                  title="Remove this element"
                  onClick={() =>
                    guard(() => api.listDeleteIndex(activeId, keyName, i))
                  }
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="add-row">
        <input
          placeholder="value"
          value={nv}
          onChange={(e) => setNv(e.target.value)}
        />
        <button
          disabled={!nv}
          onClick={() =>
            guard(async () => {
              await api.listPushValue(activeId, keyName, nv, true);
              setNv("");
            })
          }
        >
          Push left
        </button>
        <button
          className="primary"
          disabled={!nv}
          onClick={() =>
            guard(async () => {
              await api.listPushValue(activeId, keyName, nv, false);
              setNv("");
            })
          }
        >
          Push right
        </button>
      </div>
    </div>
  );
}

/* ---------- set ---------- */
function SetEditor({
  keyName,
  members,
  activeId,
  guard,
}: {
  keyName: string;
  members: string[];
  activeId: string;
  guard: Guard;
}) {
  const [nm, setNm] = useState("");

  return (
    <div>
      <table className="kv-table">
        <thead>
          <tr>
            <th>Member</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m}>
              <td>{m}</td>
              <td className="actions">
                <button
                  className="small ghost danger"
                  onClick={() =>
                    guard(() => api.setRemoveMember(activeId, keyName, m))
                  }
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="add-row">
        <input
          placeholder="member"
          value={nm}
          onChange={(e) => setNm(e.target.value)}
        />
        <button
          className="primary"
          disabled={!nm}
          onClick={() =>
            guard(async () => {
              await api.setAddMember(activeId, keyName, nm);
              setNm("");
            })
          }
        >
          Add member
        </button>
      </div>
    </div>
  );
}

/* ---------- zset ---------- */
function ZSetEditor({
  keyName,
  members,
  activeId,
  guard,
}: {
  keyName: string;
  members: { member: string; score: number }[];
  activeId: string;
  guard: Guard;
}) {
  const [nm, setNm] = useState("");
  const [ns, setNs] = useState("0");

  return (
    <div>
      <table className="kv-table">
        <thead>
          <tr>
            <th style={{ width: 100 }}>Score</th>
            <th>Member</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.member}>
              <td>
                <EditableCell
                  value={String(m.score)}
                  onSave={(val) =>
                    guard(() =>
                      api.zsetAddMember(activeId, keyName, m.member, Number(val))
                    )
                  }
                />
              </td>
              <td>{m.member}</td>
              <td className="actions">
                <button
                  className="small ghost danger"
                  onClick={() =>
                    guard(() => api.zsetRemoveMember(activeId, keyName, m.member))
                  }
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="add-row">
        <input
          placeholder="score"
          type="number"
          value={ns}
          style={{ maxWidth: 100 }}
          onChange={(e) => setNs(e.target.value)}
        />
        <input
          placeholder="member"
          value={nm}
          onChange={(e) => setNm(e.target.value)}
        />
        <button
          className="primary"
          disabled={!nm}
          onClick={() =>
            guard(async () => {
              await api.zsetAddMember(activeId, keyName, nm, Number(ns));
              setNm("");
              setNs("0");
            })
          }
        >
          Add member
        </button>
      </div>
    </div>
  );
}
