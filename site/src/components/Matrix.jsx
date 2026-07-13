import React from "react";

// Animated WezTerm "Matrix" multi-pane orchestration demo. Client island.
const matrixStyles = {
  win: { background: "var(--surface-code)", borderRadius: "var(--radius-md)", overflow: "hidden", boxShadow: "var(--shadow-terminal)", border: "1px solid #0e1620", fontFamily: "var(--font-mono)" },
  bar: { display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", background: "#141d27", borderBottom: "1px solid #0e1620" },
  dot: { width: 11, height: 11, borderRadius: "50%" },
  title: { fontSize: 11.5, color: "#8fa1b0", marginLeft: 6, letterSpacing: ".02em" },
  parent: { padding: "13px 16px", fontSize: 13, lineHeight: 1.6, color: "#e8e2d4", borderBottom: "1px solid #0e1620", minHeight: 92 },
  grid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)" },
  pane: { borderRight: "1px solid #0e1620", minHeight: 172, display: "flex", flexDirection: "column" },
  paneHead: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", background: "#101923", borderBottom: "1px solid #0e1620" },
  role: { fontSize: 11.5, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" },
  paneBody: { padding: "10px 12px", fontSize: 12, lineHeight: 1.55, color: "#c7d0d8", flex: 1 },
  statusWrap: { display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "#8fa1b0" },
};

const MATRIX_PANES = [
  { role: "scout", color: "#7fb2ce", lines: [
    "read  extensions/watch-agent.ts",
    "read  lib/task-widget.ts",
    "grep  retry|backoff → 3 hits",
    "✓ 2 likely causes"] },
  { role: "planner", color: "#b79ad2", lines: [
    "draft plan · 4 steps",
    "risk: restart loop on failure",
    "gate: worktree recommended",
    "✓ plan ready"] },
  { role: "worker", color: "#8fce9b", worktree: true, lines: [
    "worktree .pi/wt/fix-flaky",
    "edit  watch-agent.ts",
    "run   bun test → 12 pass",
    "✓ worktree ready to review"] },
];

const PILL_ICONS = { running: "●", done: "✓" };

// inline task-widget pill (mirrors the TaskPill web variant)
function MatrixPill({ status, kind, label }) {
  return (
    <span className={`pib-pill pib-pill--${status}`}>
      <span className="pib-pill__gl">‹</span>
      <span className="pib-pill__ic">{PILL_ICONS[status] || "○"}</span>
      <span className="pib-pill__kind">{kind}</span>
      <span className="pib-pill__sep">·</span>
      <span className="pib-pill__lbl">{label}</span>
      <span className="pib-pill__gl">›</span>
    </span>
  );
}

function matrixCmd(text) {
  const m = text.match(/^(\/[\w-]+)(.*)$/);
  if (!m) return text;
  return [<span key="s" style={{ color: "var(--orange-400)", fontWeight: 600 }}>{m[1]}</span>, m[2]];
}

export default function MatrixDemo() {
  const [runId, setRunId] = React.useState(0);
  const [parent, setParent] = React.useState([]);
  const [panes, setPanes] = React.useState(MATRIX_PANES.map((p) => ({ role: p.role, color: p.color, worktree: p.worktree, mounted: false, status: "idle", lines: [] })));
  const timers = React.useRef([]);

  React.useEffect(() => {
    let cancelled = false;
    const wait = (ms) => new Promise((res) => { const id = setTimeout(res, ms); timers.current.push(id); });
    const setPane = (i, patch) => setPanes((P) => P.map((p, j) => j === i ? { ...p, ...(typeof patch === "function" ? patch(p) : patch) } : p));
    const pushLine = (i, line) => setPane(i, (p) => ({ lines: [...p.lines, line] }));

    async function streamPane(i) {
      const def = MATRIX_PANES[i];
      setPane(i, { mounted: true, status: "running" });
      await wait(360);
      for (let l = 0; l < def.lines.length; l++) { if (cancelled) return; pushLine(i, def.lines[l]); await wait(l === def.lines.length - 1 ? 260 : 460); }
      setPane(i, { status: "done" });
    }

    async function run() {
      setParent([]); setPanes(MATRIX_PANES.map((p) => ({ role: p.role, color: p.color, worktree: p.worktree, mounted: false, status: "idle", lines: [] })));
      await wait(650);
      setParent((L) => [...L, { k: "cmd", t: "/matrix investigate flaky worker tests" }]); await wait(700);
      setParent((L) => [...L, { k: "dim", t: "splitting scout · planner below parent in workspace default" }]); await wait(500);
      await streamPane(0);
      await streamPane(1);
      await wait(300);
      setParent((L) => [...L, { k: "cmd", t: "/matrix-join all" }]); await wait(650);
      setPane(0, { mounted: false, status: "idle", lines: [] });
      setPane(1, { mounted: false, status: "idle", lines: [] });
      setParent((L) => [...L, { k: "ok", t: "✓ joined 2 agents · panes cleaned up" }]); await wait(550);
      setParent((L) => [...L, { k: "info", t: "matrix_spawn worker · worktree: true · fix + verify" }]); await wait(650);
      await streamPane(2);
      await wait(300);
      setParent((L) => [...L, { k: "ok", t: "✓ matrix complete · fix-flaky ready to merge" }]);
      await wait(3600);
      if (!cancelled) setRunId((n) => n + 1);
    }
    run();
    return () => { cancelled = true; timers.current.forEach(clearTimeout); timers.current = []; };
  }, [runId]);

  const parentColor = { cmd: "#f2f0e8", dim: "#8fa1b0", ok: "var(--pea-500)", info: "#7fb2ce" };
  const statusLabel = { idle: "idle", running: "running", done: "done" };
  const dotColor = (s) => s === "done" ? "var(--pea-500)" : s === "running" ? "var(--mustard-500)" : "#3a4b59";
  const visiblePanes = panes.filter((p) => p.mounted);

  return (
    <div>
      <div style={matrixStyles.win}>
        <div style={matrixStyles.bar}>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ ...matrixStyles.dot, background: "#e0685b" }} />
            <span style={{ ...matrixStyles.dot, background: "#e6b02c" }} />
            <span style={{ ...matrixStyles.dot, background: "#6fa84c" }} />
          </div>
          <span style={matrixStyles.title}>WezTerm · <b style={{ color: "var(--orange-400)" }}>workspace default</b> · parent pi</span>
        </div>

        <div style={matrixStyles.parent}>
          {parent.map((l, i) => (
            <div key={i} style={{ color: parentColor[l.k] }}>
              {l.k === "cmd" && <span style={{ color: "var(--pea-500)" }}>$ </span>}
              {l.k === "cmd" ? <span>{matrixCmd(l.t)}</span> : <span>{l.t}</span>}
            </div>
          ))}
          <span className="pib-term__caret" />
        </div>

        <div style={{ ...matrixStyles.grid, gridTemplateColumns: `repeat(${Math.max(1, visiblePanes.length)}, 1fr)` }}>
          {visiblePanes.map((p, i) => (
            <div key={p.role} style={{ ...matrixStyles.pane, borderRight: i === visiblePanes.length - 1 ? "none" : matrixStyles.pane.borderRight, transition: "opacity .35s ease" }}>
              <div style={matrixStyles.paneHead}>
                <span style={{ ...matrixStyles.role, color: p.color }}>{p.role}{p.worktree ? " ⌥" : ""}</span>
                <span style={matrixStyles.statusWrap}>
                  <span style={{ ...matrixStyles.dot, width: 8, height: 8, background: dotColor(p.status), animation: p.status === "running" ? "pib-pulse 1.1s ease infinite" : "none" }} />
                  {p.mounted ? statusLabel[p.status] : "—"}
                </span>
              </div>
              <div style={matrixStyles.paneBody}>
                {p.lines.map((ln, k) => (
                  <div key={k} style={{ color: ln.startsWith("✓") ? "var(--pea-500)" : "#c7d0d8" }}>{ln}</div>
                ))}
                {p.status === "running" && <span className="pib-term__caret" />}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* the task widget mirrors delegated work */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        {panes.filter((p) => p.mounted).map((p, i) => (
          <MatrixPill key={i} status={p.status === "done" ? "done" : "running"} kind={"matrix " + p.role} label={p.worktree ? "fix-flaky" : "matrix-pibarm"} />
        ))}
      </div>
    </div>
  );
}
