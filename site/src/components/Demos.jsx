import React from "react";
import MatrixDemo from "./Matrix.jsx";
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
    id: "matrix",
    number: "02",
    label: "Matrix",
    title: "Matrix issue triage",
    note: "triage → plan → worktree → watch",
  },
];

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

        {active === "plan" ? (
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
        ) : (
          <div>
            <p className="demo-note demo-note--wide">Scout maps scope while planner orders dependencies. The parent works through unblocked plans in isolated worktrees and starts a watcher for each pull request's reviews and CI.</p>
            <MatrixDemo />
            <p className="demo-callout"><b>Why visible?</b> Parent-controlled panes let you watch and capture each agent while the parent pi remains usable.</p>
          </div>
        )}
      </div>
    </div>
  );
}
