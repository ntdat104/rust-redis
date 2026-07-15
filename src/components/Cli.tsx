import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";

interface Entry {
  cmd: string;
  output: string;
  error?: boolean;
}

export function Cli() {
  const activeId = useStore((s) => s.activeId)!;
  const refreshDetail = useStore((s) => s.refreshDetail);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const outRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    outRef.current?.scrollTo(0, outRef.current.scrollHeight);
  }, [entries]);

  const submit = async () => {
    const cmd = input.trim();
    if (!cmd) return;
    setInput("");
    setHistory((h) => [...h, cmd]);
    setHistIdx(-1);
    try {
      const output = await api.runCommand(activeId, cmd);
      setEntries((e) => [...e, { cmd, output }]);
      // A write command may have changed the selected key.
      refreshDetail();
    } catch (err) {
      setEntries((e) => [...e, { cmd, output: String(err), error: true }]);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submit();
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
      if (history[idx] !== undefined) {
        setHistIdx(idx);
        setInput(history[idx]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx < 0) return;
      const idx = histIdx + 1;
      if (idx >= history.length) {
        setHistIdx(-1);
        setInput("");
      } else {
        setHistIdx(idx);
        setInput(history[idx]);
      }
    }
  };

  return (
    <div className="cli">
      <div className="out" ref={outRef}>
        {entries.length === 0 && (
          <div className="faint">
            Type a Redis command, e.g. <span className="mono">GET mykey</span>
          </div>
        )}
        {entries.map((e, i) => (
          <div key={i}>
            <div className="cmd">&gt; {e.cmd}</div>
            <div className={e.error ? "err" : "res"}>{e.output}</div>
          </div>
        ))}
      </div>
      <div className="prompt">
        <span>&gt;</span>
        <input
          value={input}
          placeholder="Redis command…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}
