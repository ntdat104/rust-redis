import { useEffect, useState } from "react";
import { useStore } from "./store";
import { ConnectionsView } from "./components/ConnectionsView";
import { KeyList } from "./components/KeyList";
import { KeyView } from "./components/KeyView";
import { Cli } from "./components/Cli";
import { ServerInfo } from "./components/ServerInfo";
import { SlowLog } from "./components/SlowLog";
import { PubSub } from "./components/PubSub";
import { ClusterView } from "./components/ClusterView";

type Tab = "browser" | "info" | "slowlog" | "pubsub" | "cluster";

const TABS: { id: Tab; label: string }[] = [
  { id: "browser", label: "🔑 Browser" },
  { id: "info", label: "📊 Server Info" },
  { id: "slowlog", label: "🐢 Slow Log" },
  { id: "pubsub", label: "📡 Pub/Sub" },
];

export default function App() {
  const activeId = useStore((s) => s.activeId);
  const summary = useStore((s) => s.summary);
  const db = useStore((s) => s.db);
  const selectDb = useStore((s) => s.selectDb);
  const disconnect = useStore((s) => s.disconnect);
  const error = useStore((s) => s.error);
  const setError = useStore((s) => s.setError);
  const connections = useStore((s) => s.connections);

  const [tab, setTab] = useState<Tab>("browser");
  const [showCli, setShowCli] = useState(false);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error, setError]);

  if (!activeId || !summary) {
    return (
      <>
        <ConnectionsView />
        <ErrorBanner error={error} onClose={() => setError(null)} />
      </>
    );
  }

  const profile = connections.find((c) => c.id === activeId);
  const mode = profile?.mode ?? "standalone";
  const tabs =
    mode === "cluster"
      ? [...TABS, { id: "cluster" as Tab, label: "🕸 Cluster" }]
      : TABS;

  return (
    <div className="workspace">
      <div className="topbar">
        <span className="title">
          <span style={{ color: "var(--accent)" }}>◆</span>{" "}
          {profile?.name ?? "Redis"}
        </span>
        {summary.serverVersion && (
          <span className="badge">v{summary.serverVersion}</span>
        )}
        {mode === "cluster" ? (
          <span className="badge">cluster</span>
        ) : (
          <label className="row" style={{ margin: 0 }}>
            <span className="faint">DB</span>
            <select
              value={db}
              onChange={(e) => selectDb(Number(e.target.value))}
              style={{ padding: "4px 8px" }}
            >
              {summary.databases.map((d) => (
                <option key={d.index} value={d.index}>
                  {d.index} ({d.keys})
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="spacer" />
        <button
          className={showCli ? "small primary" : "small"}
          onClick={() => setShowCli((v) => !v)}
        >
          &gt;_ CLI
        </button>
        <button className="small" onClick={disconnect}>
          Disconnect
        </button>
      </div>

      <div className="main">
        {tab === "browser" && (
          <>
            <KeyList />
            <KeyView />
          </>
        )}
        {tab === "info" && <ServerInfo />}
        {tab === "slowlog" && <SlowLog />}
        {tab === "pubsub" && <PubSub />}
        {tab === "cluster" && <ClusterView />}
      </div>

      {showCli && <Cli />}

      <ErrorBanner error={error} onClose={() => setError(null)} />
    </div>
  );
}

function ErrorBanner({
  error,
  onClose,
}: {
  error: string | null;
  onClose: () => void;
}) {
  if (!error) return null;
  return (
    <div className="error-banner">
      <span>⚠ {error}</span>
      <button className="small ghost" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
