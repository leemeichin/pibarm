import React from "react";
import { SESSION } from "../data/site.ts";

// highlight a leading /slash-command in orange
function cmdColor(text) {
  const m = text.match(/^(\/[\w-]+)(.*)$/);
  if (!m) return text;
  return [<span key="s" style={{ color: "var(--orange-400)", fontWeight: 600 }}>{m[1]}</span>, m[2]];
}

const styles = {
  prompt: { color: "var(--pea-500)", userSelect: "none" },
  you: { color: "var(--orange-400)", userSelect: "none" },
};

/**
 * Animated, looping recreation of a scripted pi session (plan -> execute in a
 * worktree), typed out inside the faux terminal chrome. Client island.
 */
export default function PiSession() {
  const script = SESSION;
  const [lines, setLines] = React.useState([]);
  const [typing, setTyping] = React.useState(null); // {k, text}
  const timers = React.useRef([]);

  React.useEffect(() => {
    let cancelled = false;
    const clearAll = () => { timers.current.forEach(clearTimeout); timers.current = []; };
    const wait = (ms) => new Promise((res) => { const id = setTimeout(res, ms); timers.current.push(id); });

    async function typeLine(step) {
      const isType = step.k === "cmd" || step.k === "you";
      if (!isType) { setLines((L) => [...L, step]); await wait(step.d); return; }
      setTyping({ k: step.k, text: "" });
      for (let i = 1; i <= step.t.length; i++) {
        if (cancelled) return;
        setTyping({ k: step.k, text: step.t.slice(0, i) });
        await wait(step.d);
      }
      setLines((L) => [...L, step]);
      setTyping(null);
      await wait(240);
    }

    async function run() {
      while (!cancelled) {
        setLines([]); setTyping(null);
        await wait(500);
        for (const step of script) { if (cancelled) return; await typeLine(step); }
        await wait(2600);
      }
    }
    run();
    return () => { cancelled = true; clearAll(); };
  }, []);

  const renderLine = (s, key) => {
    if (s.k === "cmd") return <div key={key}><span style={styles.prompt}>$ </span><span style={{ color: "#f2f0e8" }}>{cmdColor(s.t)}</span></div>;
    if (s.k === "you") return <div key={key}><span style={styles.you}>› </span><span style={{ color: "#cdd7de" }}>{s.t}</span></div>;
    const cls = { dim: "dim", info: "info", ok: "ok", err: "err", warn: "warn" }[s.k] || "dim";
    return <div key={key} className={cls}>{s.t}</div>;
  };

  return (
    <div className="pib-term">
      <div className="pib-term__bar">
        <div className="pib-term__dots">
          <span className="pib-term__dot" style={{ background: "#e0685b" }} />
          <span className="pib-term__dot" style={{ background: "#e6b02c" }} />
          <span className="pib-term__dot" style={{ background: "#6fa84c" }} />
        </div>
        <span className="pib-term__title">pi — <b>pibarm</b></span>
      </div>
      <div className="pib-term__body" style={{ height: 320, maxHeight: 320, fontSize: 13.5 }}>
        {lines.map(renderLine)}
        {typing && (typing.k === "cmd"
          ? <div><span style={styles.prompt}>$ </span><span style={{ color: "#f2f0e8" }}>{cmdColor(typing.text)}</span><span className="pib-term__caret" /></div>
          : <div><span style={styles.you}>› </span><span style={{ color: "#cdd7de" }}>{typing.text}</span><span className="pib-term__caret" /></div>)}
        {!typing && <span className="pib-term__caret" />}
      </div>
    </div>
  );
}
