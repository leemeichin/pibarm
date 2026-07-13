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
  {
    id: "status",
    number: "03",
    label: "Repo status",
    title: "Repository pulse",
    note: "git → forge → pull request → CI",
    description: "One command gathers the branch, dirty files, forge, pull request and checks, then keeps the same state visible in pi's statusline.",
    lines: [
      { k: "cmd", t: "/repo-status" },
      { k: "dim", t: "branch  main · clean" },
      { k: "info", t: "forge   GitHub · PR #128 open · review requested" },
      { k: "warn", t: "CI      4/5 passing · integration running" },
      { k: "ok", t: "✓ statusline updated" },
    ],
  },
  {
    id: "watcher",
    number: "04",
    label: "Watcher",
    title: "A PR watcher that sleeps",
    note: "poll → compare → wake on change",
    description: "A sibling agent polls quietly and only spends a pi turn when reviews or checks change, leaving the parent session free for other work.",
    lines: [
      { k: "you", t: "watch PR #128 for reviews and CI" },
      { k: "info", t: "tool    watch_agent · interval 60s" },
      { k: "dim", t: "poll    no change · sleeping" },
      { k: "warn", t: "change  integration check failed" },
      { k: "ok", t: "✓ watcher woke · triage started once" },
    ],
  },
  {
    id: "presets",
    number: "05",
    label: "Presets",
    title: "Models matched to the job",
    note: "planner reads → executor writes",
    description: "Named presets switch model, thinking level and tools together, so a planner stays read-only and an executor gets only what the approved work needs.",
    lines: [
      { k: "cmd", t: "/preset planner" },
      { k: "info", t: "model   reasoning · thinking high" },
      { k: "dim", t: "tools   read · bash · question" },
      { k: "cmd", t: "/preset executor" },
      { k: "info", t: "model   balanced · thinking medium" },
      { k: "ok", t: "tools   read · bash · edit · write" },
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
        {active === "matrix" && (
          <div>
            <p className="demo-note demo-note--wide">Scout maps scope while planner orders dependencies. The parent works through unblocked plans in isolated worktrees and starts a watcher for each pull request's reviews and CI.</p>
            <MatrixDemo />
            <p className="demo-callout"><b>Why visible?</b> Parent-controlled panes let you watch and capture each agent while the parent pi remains usable.</p>
          </div>
        )}
        {demo.lines && <Snapshot demo={demo} />}
      </div>
    </div>
  );
}
