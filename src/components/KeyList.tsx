import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { TypeBadge } from "./TypeBadge";
import { NewKeyModal } from "./NewKeyModal";

export function KeyList() {
  const keys = useStore((s) => s.keys);
  const pattern = useStore((s) => s.pattern);
  const scanning = useStore((s) => s.scanning);
  const scanComplete = useStore((s) => s.scanComplete);
  const selectedKey = useStore((s) => s.selectedKey);
  const dbSize = useStore((s) => s.dbSize);
  const startScan = useStore((s) => s.startScan);
  const loadMore = useStore((s) => s.loadMore);
  const selectKey = useStore((s) => s.selectKey);

  const [query, setQuery] = useState(pattern);
  const [showNew, setShowNew] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(pattern), [pattern]);

  // Auto-load more when the user scrolls near the bottom.
  const onScroll = () => {
    const el = listRef.current;
    if (!el || scanning || scanComplete) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) loadMore();
  };

  return (
    <div className="keylist">
      <div className="search">
        <div className="toolbar">
          <input
            value={query}
            placeholder="Filter (e.g. user:*)"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && startScan(query)}
          />
          <button
            className="icon-btn"
            title="Search"
            onClick={() => startScan(query)}
          >
            🔍
          </button>
        </div>
        <div className="toolbar">
          <button className="small" onClick={() => setShowNew(true)}>
            + Key
          </button>
          <button
            className="small ghost"
            title="Refresh"
            onClick={() => startScan(query)}
          >
            ↻ Refresh
          </button>
          <div className="spacer" />
          <span className="faint" style={{ fontSize: 11 }}>
            {dbSize.toLocaleString()} keys
          </span>
        </div>
      </div>

      <div className="items" ref={listRef} onScroll={onScroll}>
        {keys.map((k) => (
          <div
            key={k.key}
            className={`key-item ${k.key === selectedKey ? "active" : ""}`}
            onClick={() => selectKey(k.key)}
          >
            <TypeBadge type={k.type} />
            <span className="kname" title={k.key}>
              {k.key}
            </span>
          </div>
        ))}
        {keys.length === 0 && !scanning && (
          <div className="faint" style={{ padding: 16, textAlign: "center" }}>
            No keys match.
          </div>
        )}
      </div>

      <div className="list-footer">
        {scanning ? (
          <span className="spinner">Scanning…</span>
        ) : (
          <span>
            {keys.length} loaded{scanComplete ? " · complete" : ""}
          </span>
        )}
        {!scanComplete && !scanning && (
          <button className="small ghost" onClick={loadMore}>
            Load more
          </button>
        )}
      </div>

      {showNew && <NewKeyModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
