import { useEffect, useRef, useState } from "react";

const INTERVALS = [
  { label: "Manual", ms: 0 },
  { label: "2s", ms: 2000 },
  { label: "5s", ms: 5000 },
  { label: "10s", ms: 10000 },
  { label: "30s", ms: 30000 },
];

function agoLabel(lastUpdated?: number): string {
  if (!lastUpdated) return "";
  const s = Math.max(0, Math.round((Date.now() - lastUpdated) / 1000));
  if (s < 1) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

/**
 * Redis Insight-style refresh control: a manual refresh button, an
 * auto-refresh interval picker, and a live "last updated" indicator.
 */
export function RefreshControl({
  loading,
  lastUpdated,
  onRefresh,
  defaultMs = 0,
}: {
  loading: boolean;
  lastUpdated?: number;
  onRefresh: () => void;
  defaultMs?: number;
}) {
  const [intervalMs, setIntervalMs] = useState(defaultMs);
  const [, setTick] = useState(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Auto-refresh timer (paused while this component is unmounted, i.e. when the
  // tab isn't visible — matching Redis Insight).
  useEffect(() => {
    if (intervalMs <= 0) return;
    const t = setInterval(() => onRefreshRef.current(), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);

  // Keep the "updated Xs ago" label live.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="row" style={{ gap: 8 }}>
      <span className="faint" style={{ fontSize: 11, minWidth: 74, textAlign: "right" }}>
        {loading ? "Refreshing…" : agoLabel(lastUpdated)}
      </span>
      <button
        className="small ghost icon-btn"
        style={{ width: 30, height: 30 }}
        onClick={onRefresh}
        title="Refresh now"
      >
        ↻
      </button>
      <select
        value={intervalMs}
        onChange={(e) => setIntervalMs(Number(e.target.value))}
        title="Auto-refresh interval"
        style={{ padding: "4px 8px" }}
      >
        {INTERVALS.map((i) => (
          <option key={i.ms} value={i.ms}>
            {i.label === "Manual" ? "Auto: Off" : `Auto: ${i.label}`}
          </option>
        ))}
      </select>
    </div>
  );
}
