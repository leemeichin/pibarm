import React from "react";
import AgentPanesDemo from "./AgentPanes.jsx";
import PiSession from "./PiSession.jsx";

const DEMOS = [
  {
    id: "plan",
    number: "01",
    label: "Planning",
    title: "A planning session",
    note: "/plan → questions → /execute-plan worktree",
  },
  {
    id: "agents",
    number: "02",
    label: "Agent panes",
    title: "Automatic agent panes",
    note: "delegate → tile → capture → watch",
  },
  {
    id: "obsidian",
    number: "03",
    label: "Obsidian",
    title: "Sessions in your vault",
    note: "export → organise → auto-sync",
    description: "Each session becomes a Markdown note grouped by repository. Run /obsidian-export whenever you want, or enable auto-sync to update it after turns and compaction.",
    lines: [
      { k: "you", t: "tree ~/Vault/Pi" },
      { k: "dim", t: "~/Vault/Pi" },
      { k: "info", t: "├── .pibarm-sessions.json" },
      { k: "info", t: "├── example-org" },
      { k: "info", t: "│   └── example-repo" },
      { k: "ok", t: "│       └── plan-release.md" },
      { k: "info", t: "└── local" },
      { k: "ok", t: "    └── scratchpad/session-42.md" },
    ],
  },
];

function Snapshot({ demo }) {
  return (
    <div className="demo-snapshot">
      <div className="pib-term">
        <div className="pib-term__bar">
          <div className="pib-term__dots">
            <span className="pib-term__dot" style={{ background: "#e0685b" }} />
            <span className="pib-term__dot" style={{ background: "#e6b02c" }} />
            <span className="pib-term__dot" style={{ background: "#6fa84c" }} />
          </div>
          <span className="pib-term__title">pi — <b>{demo.label.toLowerCase()}</b></span>
        </div>
        <div className="pib-term__body demo-snapshot__body">
          {demo.lines.map((line, index) => (
            <div key={index} className={line.k === "you" ? "demo-prompt" : line.k}>{line.k === "you" && "› "}{line.t}</div>
          ))}
          <span className="pib-term__caret" />
        </div>
      </div>
      <p className="demo-note">{demo.description}</p>
    </div>
  );
}

export default function Demos() {
  const [active, setActive] = React.useState(DEMOS[0].id);
  const demo = DEMOS.find((item) => item.id === active);

  function moveTab(event, index) {
    const moves = { ArrowLeft: -1, ArrowRight: 1, Home: -index, End: DEMOS.length - index - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = (index + moves[event.key] + DEMOS.length) % DEMOS.length;
    setActive(DEMOS[next].id);
    document.getElementById(`demo-tab-${DEMOS[next].id}`)?.focus();
  }

  return (
    <div className="demo-shell">
      <div className="demo-tabs" role="tablist" aria-label="pibarm demos">
        {DEMOS.map((item, index) => (
          <button
            key={item.id}
            id={`demo-tab-${item.id}`}
            className="demo-tab"
            type="button"
            role="tab"
            aria-selected={active === item.id}
            aria-controls={`demo-panel-${item.id}`}
            tabIndex={active === item.id ? 0 : -1}
            onClick={() => setActive(item.id)}
            onKeyDown={(event) => moveTab(event, index)}
          >
            <span>{item.number}</span> {item.label}
          </button>
        ))}
      </div>

      <div id={`demo-panel-${demo.id}`} className="demo-panel" role="tabpanel" aria-labelledby={`demo-tab-${demo.id}`}>
        <div className="demo-cap">
          <span className="demo-cap-no">{demo.number}</span>
          <h3 className="demo-cap-title">{demo.title}</h3>
          <span className="demo-cap-note">{demo.note}</span>
        </div>

        {active === "plan" && (
          <div className="pib-demo-row">
            <PiSession />
            <div>
              <p className="demo-note">pi enters read-only plan mode, inspects the repo, and asks a clarifying question before proposing anything. Once you answer, it captures a plan and executes it in an isolated git worktree — your active checkout never moves.</p>
              <div className="demo-tags">
                <span className="demo-tag demo-tag--info">● read-only</span>
                <span className="demo-tag demo-tag--success">● worktree</span>
              </div>
            </div>
          </div>
        )}
        {active === "agents" && (
          <div className="demo-agent-panes">
            <div className="demo-agent-panes__intro">
              <p className="demo-note">Use the standard subagent and worktree tools. When tmux or Zellij is available, pibarm automatically arranges their live output in managed panes; otherwise the same calls stay headless.</p>
              <p className="demo-agent-panes__callout"><b>Visible without a terminal lock-in.</b> Native tmux and Zellij clients can attach, while the parent still receives the captured result and keeps control.</p>
            </div>
            <AgentPanesDemo />
          </div>
        )}
        {demo.lines && <Snapshot demo={demo} />}
      </div>
    </div>
  );
}
