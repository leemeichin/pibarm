import React from "react";

const PARENT_LINES = [
  { at: 1, kind: "dim", text: "search_tools → forge · delegation · worktree" },
  { at: 2, kind: "tool", text: "▶ run_subagents  scout · planner" },
  { at: 6, kind: "success", text: "✔ joined 2 agents · 4 tickets mapped" },
  { at: 7, kind: "tool", text: "▶ run_worktree_agent  issue-17" },
  { at: 11, kind: "success", text: "✔ PR #108 opened · watcher started" },
  { at: 12, kind: "response", text: "Issue #17 is in review. #21 is the next unblocked plan." },
];

const AGENTS = [
  {
    name: "scout",
    lines: [
      { at: 1, kind: "start", text: "[agent scout started]" },
      { at: 2, kind: "tool", text: "▶ forge_tickets {\"state\":\"open\"}" },
      { at: 3, kind: "success", text: "✔ 4 open · #17 #21 #34 #38" },
      { at: 4, kind: "response", text: "#17 auth guard blocks #34 deploy work" },
      { at: 5, kind: "done", text: "[agent scout exited 0]" },
    ],
  },
  {
    name: "planner",
    lines: [
      { at: 2, kind: "start", text: "[agent planner started]" },
      { at: 3, kind: "tool", text: "▶ read {\"path\":\"docs/runtime.md\"}" },
      { at: 4, kind: "response", text: "queue  #17 → #34 → #38" },
      { at: 5, kind: "response", text: "parallel  #21 documentation" },
      { at: 6, kind: "done", text: "[agent planner exited 0]" },
    ],
  },
  {
    name: "worktree",
    lines: [
      { at: 7, kind: "start", text: "[agent worktree issue-17 started]" },
      { at: 8, kind: "tool", text: "▶ edit extensions/permission-gate.ts" },
      { at: 9, kind: "tool", text: "▶ bash {\"command\":\"bun test\"}" },
      { at: 10, kind: "success", text: "✔ 104 tests passed · +18 −7" },
      { at: 11, kind: "done", text: "[agent worktree exited 0]" },
    ],
  },
];

function TaskPill({ status, kind, label }) {
  return (
    <span className={`pib-pill pib-pill--bare pib-pill--${status}`}>
      <span className="pib-pill__gl">‹</span>
      <span className="pib-pill__ic">{status === "done" ? "✓" : "●"}</span>
      <span className="pib-pill__kind">{kind}</span>
      <span className="pib-pill__sep">·</span>
      <span className="pib-pill__lbl">{label}</span>
      <span className="pib-pill__gl">›</span>
    </span>
  );
}

export default function AgentPanesDemo() {
  const [frame, setFrame] = React.useState(0);

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFrame(12);
      return;
    }
    const timer = window.setInterval(() => setFrame((current) => (current >= 16 ? 0 : current + 1)), 620);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="agent-terminal" aria-label="Matrix issue triage in a parent Pi pane with three delegated agent panes">
      <div className="agent-terminal__chrome">
        <div className="pib-term__dots" aria-hidden="true">
          <span className="pib-term__dot" style={{ background: "#e0685b" }} />
          <span className="pib-term__dot" style={{ background: "#e6b02c" }} />
          <span className="pib-term__dot" style={{ background: "#6fa84c" }} />
        </div>
        <span>tmux — issue-triage</span>
      </div>

      <div className="matrix-workspace">
        <section className="matrix-parent" aria-label="Parent Pi session">
          <div className="matrix-pane-label">parent · pi</div>
          <div className="demo-user-message">
            <span>YOU</span>
            <p>Triage every open issue. Map dependencies, plan the smallest safe changes, and start the first unblocked fix in a worktree. Keep me posted here.</p>
          </div>
          <div className="matrix-parent__transcript">
            {PARENT_LINES.filter((line) => line.at <= frame).map((line) => (
              <div className={`agent-terminal__line agent-terminal__line--${line.kind}`} key={line.at}>{line.text}</div>
            ))}
            {frame > 0 && frame < 12 && <span className="pib-term__caret" aria-hidden="true" />}
          </div>
          <div className="matrix-parent__tasks">
            {frame >= 1 && <TaskPill status={frame >= 5 ? "done" : "running"} kind="sub scout" label="open issues" />}
            {frame >= 2 && <TaskPill status={frame >= 6 ? "done" : "running"} kind="sub planner" label="dependency map" />}
            {frame >= 7 && <TaskPill status={frame >= 11 ? "done" : "running"} kind="wt issue-17" label="isolated fix" />}
            {frame >= 11 && <TaskPill status="running" kind="watch pr" label="review + CI" />}
          </div>
          <div className="matrix-parent__status">
            <span>issue-triage (main)</span>
            <span>gpt-5.6-sol · xhigh</span>
          </div>
        </section>

        <div className="matrix-agents">
          {AGENTS.map((agent) => {
            const visible = agent.lines.filter((line) => line.at <= frame);
            const done = frame >= agent.lines.at(-1).at;
            const running = visible.length > 0 && !done;
            return (
              <section className="matrix-agent" aria-label={`${agent.name} agent`} key={agent.name}>
                <div className="matrix-pane-label">
                  <span>{agent.name}</span>
                  <span className={`matrix-agent__dot matrix-agent__dot--${done ? "done" : running ? "running" : "idle"}`} />
                </div>
                <div className="matrix-agent__body">
                  {visible.map((line) => (
                    <div className={`agent-terminal__line agent-terminal__line--${line.kind}`} key={line.at}>{line.text}</div>
                  ))}
                  {running && <span className="pib-term__caret" aria-hidden="true" />}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="agent-terminal__tmuxbar" aria-hidden="true">
        <span>[issue-triage]</span>
        <strong>1:matrix*</strong>
        <span className="agent-terminal__clock">14:32</span>
      </div>
    </div>
  );
}
