import React from "react";

// Animated automatic multiplexer-pane demo. Client island.
const paneStyles = {
  root: { height: 460, overflow: "hidden" },
  win: { background: "var(--surface-code)", borderRadius: "var(--radius-md)", overflow: "hidden", boxShadow: "var(--shadow-terminal)", border: "1px solid #0e1620", fontFamily: "var(--font-mono)" },
  bar: { display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", background: "#141d27", borderBottom: "1px solid #0e1620" },
  dot: { width: 11, height: 11, borderRadius: "50%" },
  title: { fontSize: 11.5, color: "#8fa1b0", marginLeft: 6, letterSpacing: ".02em" },
  parent: { boxSizing: "border-box", height: 148, overflow: "hidden", padding: "13px 16px", fontSize: 13, lineHeight: 1.6, color: "#e8e2d4", borderBottom: "1px solid #0e1620" },
  grid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", height: 210 },
  pane: { borderRight: "1px solid #0e1620", display: "flex", flexDirection: "column", overflow: "hidden" },
  paneHead: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", background: "#101923", borderBottom: "1px solid #0e1620" },
  role: { fontSize: 11.5, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" },
  paneBody: { padding: "10px 12px", fontSize: 12, lineHeight: 1.55, color: "#c7d0d8", flex: 1 },
  statusWrap: { display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "#8fa1b0" },
};

const AGENT_PANES = [
  { role: "scout", color: "#7fb2ce", lines: [
    "forge_tickets → 4 open",
    "#1 permission gate · #20 docs",
    "#43 deploy CI · #44 web spike",
    "✓ issue map ready"] },
  { role: "planner", color: "#b79ad2", lines: [
    "dependency: #20 → #43 → #44",
    "parallel: #1 permission gate",
    "queue: #1 · #20/#43 · #44",
    "✓ 4 smallest plans ready"] },
  { role: "worker", color: "#8fce9b", worktree: true, lines: [
    "issue #1 · permission approvals",
    "worktree .pi/wt/issue-1",
    "run   bun test → pass",
    "✓ pull request opened"] },
];

const PILL_ICONS = { running: "●", done: "✓" };

// inline task-widget pill (mirrors the TaskPill web variant)
function AgentPill({ status, kind, label }) {
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

function agentCmd(text) {
  const m = text.match(/^(\/[\w-]+)(.*)$/);
  if (!m) return text;
  return [<span key="s" style={{ color: "var(--orange-400)", fontWeight: 600 }}>{m[1]}</span>, m[2]];
}

export default function AgentPanesDemo() {
  const [runId, setRunId] = React.useState(0);
  const [parent, setParent] = React.useState([]);
  const [panes, setPanes] = React.useState(AGENT_PANES.map((p) => ({ role: p.role, color: p.color, worktree: p.worktree, mounted: false, status: "idle", lines: [] })));
  const [watching, setWatching] = React.useState(false);
  const timers = React.useRef([]);

  React.useEffect(() => {
    let cancelled = false;
    const wait = (ms) => new Promise((res) => { const id = setTimeout(res, ms); timers.current.push(id); });
    const setPane = (i, patch) => setPanes((P) => P.map((p, j) => j === i ? { ...p, ...(typeof patch === "function" ? patch(p) : patch) } : p));
    const pushLine = (i, line) => setPane(i, (p) => ({ lines: [...p.lines, line] }));

    async function streamPane(i) {
      const def = AGENT_PANES[i];
      setPane(i, { mounted: true, status: "running" });
      await wait(360);
      for (let l = 0; l < def.lines.length; l++) { if (cancelled) return; pushLine(i, def.lines[l]); await wait(l === def.lines.length - 1 ? 260 : 460); }
      setPane(i, { status: "done" });
    }

    async function run() {
      setParent([]); setPanes(AGENT_PANES.map((p) => ({ role: p.role, color: p.color, worktree: p.worktree, mounted: false, status: "idle", lines: [] }))); setWatching(false);
      await wait(650);
      setParent((L) => [...L, { k: "cmd", t: "run_subagents jobs=scout,planner" }]); await wait(700);
      setParent((L) => [...L, { k: "dim", t: "automatic pane adapter · tiled scout + planner" }]); await wait(500);
      await Promise.all([streamPane(0), streamPane(1)]);
      await wait(300);
      setParent((L) => [...L, { k: "cmd", t: "run_subagents → captured results" }]); await wait(650);
      setPane(0, { mounted: false, status: "idle", lines: [] });
      setPane(1, { mounted: false, status: "idle", lines: [] });
      setParent((L) => [...L, { k: "ok", t: "✓ joined 2 agents · 4 issue plans queued" }]); await wait(550);
      setParent((L) => [...L, { k: "info", t: "loop: issue #1 → run_worktree_agent" }]); await wait(650);
      await streamPane(2);
      await wait(300);
      setParent((L) => [...L, { k: "info", t: "watch_agent · pull request review + CI loop" }]); setWatching(true); await wait(550);
      setParent((L) => [...L, { k: "ok", t: "✓ issue #1 in review · continue with next unblocked plan" }]);
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
    <div style={paneStyles.root}>
      <div style={paneStyles.win}>
        <div style={paneStyles.bar}>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ ...paneStyles.dot, background: "#e0685b" }} />
            <span style={{ ...paneStyles.dot, background: "#e6b02c" }} />
            <span style={{ ...paneStyles.dot, background: "#6fa84c" }} />
          </div>
          <span style={paneStyles.title}>tmux / Zellij · <b style={{ color: "var(--orange-400)" }}>pibarm-agents</b> · parent pi</span>
        </div>

        <div style={paneStyles.parent}>
          {parent.map((l, i) => (
            <div key={i} style={{ color: parentColor[l.k] }}>
              {l.k === "cmd" && <span style={{ color: "var(--pea-500)" }}>$ </span>}
              {l.k === "cmd" ? <span>{agentCmd(l.t)}</span> : <span>{l.t}</span>}
            </div>
          ))}
          <span className="pib-term__caret" />
        </div>

        <div style={{ ...paneStyles.grid, gridTemplateColumns: `repeat(${Math.max(1, visiblePanes.length)}, 1fr)` }}>
          {visiblePanes.map((p, i) => (
            <div key={p.role} style={{ ...paneStyles.pane, borderRight: i === visiblePanes.length - 1 ? "none" : paneStyles.pane.borderRight, transition: "opacity .35s ease" }}>
              <div style={paneStyles.paneHead}>
                <span style={{ ...paneStyles.role, color: p.color }}>{p.role}{p.worktree ? " ⌥" : ""}</span>
                <span style={paneStyles.statusWrap}>
                  <span style={{ ...paneStyles.dot, width: 8, height: 8, background: dotColor(p.status), animation: p.status === "running" ? "pib-pulse 1.1s ease infinite" : "none" }} />
                  {p.mounted ? statusLabel[p.status] : "—"}
                </span>
              </div>
              <div style={paneStyles.paneBody}>
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
          <AgentPill key={i} status={p.status === "done" ? "done" : "running"} kind={"sub " + p.role} label={p.worktree ? "issue-1" : "open-issues"} />
        ))}
        {watching && <AgentPill status="running" kind="watch pr" label="review + CI" />}
      </div>
    </div>
  );
}
