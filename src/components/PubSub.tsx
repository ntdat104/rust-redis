import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../api";
import { useStore } from "../store";
import type { PubSubMessage } from "../types";

interface Received extends PubSubMessage {
  at: string;
}

const MAX_MESSAGES = 1000;

export function PubSub() {
  const activeId = useStore((s) => s.activeId)!;
  const setError = useStore((s) => s.setError);

  const [channels, setChannels] = useState("");
  const [patterns, setPatterns] = useState("*");
  const [subscribed, setSubscribed] = useState(false);
  const [messages, setMessages] = useState<Received[]>([]);
  const outRef = useRef<HTMLDivElement>(null);

  // Listen for messages pushed from the Rust backend.
  useEffect(() => {
    const unlisten = listen<PubSubMessage>("pubsub-message", (event) => {
      if (event.payload.connectionId !== activeId) return;
      setMessages((prev) => {
        const next = [
          ...prev,
          { ...event.payload, at: new Date().toLocaleTimeString() },
        ];
        return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
      });
    });
    const unlistenErr = listen<string>("pubsub-error", (event) =>
      setError(`Pub/Sub: ${event.payload}`)
    );

    // Stop the backend listener when leaving this view.
    return () => {
      unlisten.then((f) => f());
      unlistenErr.then((f) => f());
      api.pubsubUnsubscribe(activeId).catch(() => {});
    };
  }, [activeId, setError]);

  useEffect(() => {
    outRef.current?.scrollTo(0, outRef.current.scrollHeight);
  }, [messages]);

  const subscribe = async () => {
    const ch = channels.split(",").map((s) => s.trim()).filter(Boolean);
    const pt = patterns.split(",").map((s) => s.trim()).filter(Boolean);
    if (ch.length === 0 && pt.length === 0) {
      setError("Enter at least one channel or pattern");
      return;
    }
    try {
      await api.pubsubSubscribe(activeId, ch, pt);
      setSubscribed(true);
    } catch (e) {
      setError(String(e));
    }
  };

  const unsubscribe = async () => {
    await api.pubsubUnsubscribe(activeId).catch(() => {});
    setSubscribed(false);
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>Pub/Sub Monitor</h2>
        <div className="spacer" />
        <span className="badge">{messages.length} messages</span>
        <button className="small ghost" onClick={() => setMessages([])}>
          Clear
        </button>
      </div>

      <div className="row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <input
          placeholder="Channels (comma separated)"
          value={channels}
          disabled={subscribed}
          onChange={(e) => setChannels(e.target.value)}
          style={{ flex: 1, minWidth: 180 }}
        />
        <input
          placeholder="Patterns (e.g. news.*)"
          value={patterns}
          disabled={subscribed}
          onChange={(e) => setPatterns(e.target.value)}
          style={{ flex: 1, minWidth: 180 }}
        />
        {subscribed ? (
          <button className="danger" onClick={unsubscribe}>
            ■ Stop
          </button>
        ) : (
          <button className="primary" onClick={subscribe}>
            ▶ Subscribe
          </button>
        )}
      </div>

      <div className="cli" style={{ height: "auto", flex: 1, minHeight: 200 }}>
        <div className="out" ref={outRef}>
          {messages.length === 0 && (
            <div className="faint">
              {subscribed
                ? "Listening… waiting for messages"
                : "Subscribe to one or more channels/patterns to start monitoring."}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i}>
              <span className="faint">{m.at}</span>{" "}
              <span className="cmd">
                {m.pattern ? `${m.pattern} → ` : ""}
                {m.channel}
              </span>{" "}
              <span className="res">{m.payload}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
