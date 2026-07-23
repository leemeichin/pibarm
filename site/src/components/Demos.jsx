import React from "react";
import AgentPanesDemo from "./AgentPanes.jsx";

const SCENARIOS = [
  {
    id: "checkout",
    number: "01",
    label: "Checkout bug",
    title: "Trace a checkout regression",
    note: "3 read-only agents → 1 root cause",
    project: "acme-shop",
    time: "14:32",
    prompt: "A percentage discount test started failing before release. Reproduce it, trace the calculation, and review the money boundary in parallel. Do not edit yet.",
    description: "The parent pi stays in window 1 while three subagents inspect the same checkout failure. Their captured results return to one conversation before a fix is approved.",
    result: "Normalize whole percentages in total(), validate 0–100, and round once at the final cent total.",
    tags: ["run_subagents", "read-only"],
    panes: [
      {
        name: "reproduce",
        lines: [
          { kind: "start", text: "[agent reproduce started]" },
          { kind: "thinking", text: "· thinking ·  Running npm tests" },
          { kind: "tool", text: "▶ bash {\"command\":\"npm test\",\"timeout\":120}" },
          { kind: "error", text: "✖ bash: applies a percentage discount" },
          { kind: "code", text: "  expected 960 · received -22800" },
          { kind: "response", text: "test/cart.test.js:6 reproduces on main." },
          { kind: "done", text: "[agent reproduce exited 0]" },
        ],
      },
      {
        name: "boundary",
        lines: [
          { kind: "start", text: "[agent review-boundary started]" },
          { kind: "thinking", text: "· thinking ·  Inspecting money boundaries" },
          { kind: "tool", text: "▶ read {\"path\":\"src/cart.js\"}" },
          { kind: "success", text: "✔ read: subtotal * (1 - discount)" },
          { kind: "response", text: "P0  require a finite discount from 0–100" },
          { kind: "response", text: "P1  keep prices in integer minor units" },
          { kind: "done", text: "[agent review-boundary exited 0]" },
        ],
      },
      {
        name: "trace",
        lines: [
          { kind: "start", text: "[agent trace-discount started]" },
          { kind: "tool", text: "▶ read {\"path\":\"src/cart.js\"}" },
          { kind: "tool", text: "▶ read {\"path\":\"test/cart.test.js\"}" },
          { kind: "success", text: "✔ caller supplies 20; implementation expects 0.20" },
          { kind: "thinking", text: "· response ·" },
          { kind: "response", text: "Root cause: 1200 × (1 - 20) = -22800." },
          { kind: "code", text: "return Math.round(subtotal * (1 - discount / 100));" },
          { kind: "done", text: "[agent trace-discount exited 0]" },
        ],
      },
    ],
  },
  {
    id: "runtime",
    number: "02",
    label: "Runtime upgrade",
    title: "Scope a Node 22 upgrade",
    note: "runtime pins + dependencies + CI",
    project: "parcel-api",
    time: "09:17",
    prompt: "We need Node 22 before the old base image is retired. Check runtime pins, dependency compatibility, and CI coverage in parallel; tell me the smallest safe upgrade.",
    description: "Each agent owns one bounded question, so the parent gets compatibility evidence instead of three overlapping repo tours. Implementation can then move to one isolated worktree.",
    result: "Update four runtime pins together; application code is compatible, but the Docker smoke job still hard-codes node:20.",
    tags: ["parallel research", "worktree next"],
    panes: [
      {
        name: "runtime-pins",
        lines: [
          { kind: "start", text: "[agent runtime-pins started]" },
          { kind: "tool", text: "▶ bash {\"command\":\"rg 'node:20|20.x' .\"}" },
          { kind: "success", text: "✔ .nvmrc · Dockerfile · package.json · deploy.yml" },
          { kind: "thinking", text: "· response ·" },
          { kind: "response", text: "Four pins must move in the same change." },
          { kind: "done", text: "[agent runtime-pins exited 0]" },
        ],
      },
      {
        name: "dependencies",
        lines: [
          { kind: "start", text: "[agent dependencies started]" },
          { kind: "tool", text: "▶ bash {\"command\":\"npm ls --all\"}" },
          { kind: "success", text: "✔ dependency tree resolved" },
          { kind: "tool", text: "▶ read {\"path\":\"package-lock.json\",\"limit\":80}" },
          { kind: "response", text: "No native addon blocks Node 22." },
          { kind: "response", text: "Keep the existing lockfile; no package bump needed." },
          { kind: "done", text: "[agent dependencies exited 0]" },
        ],
      },
      {
        name: "ci-smoke",
        lines: [
          { kind: "start", text: "[agent ci-smoke started]" },
          { kind: "tool", text: "▶ bash {\"command\":\"nix shell nixpkgs#nodejs_22 --command npm test\"}" },
          { kind: "success", text: "✔ 184 tests passed in 7.4s" },
          { kind: "tool", text: "▶ read {\"path\":\".github/workflows/ci.yml\"}" },
          { kind: "response", text: "Unit CI follows the matrix; Docker smoke pins node:20." },
          { kind: "code", text: "Next: run_worktree_agent → node-22" },
          { kind: "done", text: "[agent ci-smoke exited 0]" },
        ],
      },
    ],
  },
  {
    id: "migration",
    number: "03",
    label: "Risky migration",
    title: "Unblock a red migration PR",
    note: "checks + SQL + rollback review",
    project: "clinic-api",
    time: "16:48",
    prompt: "PR #482 makes users.email NOT NULL and migration CI is red. Triage the failed check, inspect the SQL, and review deploy/rollback risk before we touch the branch.",
    description: "CI evidence, migration semantics, and operational risk run side by side. The parent can block an unsafe merge and hand one concrete plan to a worktree agent.",
    result: "Do not retry CI: backfill 37 null rows in batches, validate a constraint, then set NOT NULL in a follow-up migration.",
    tags: ["CI triage", "safe rollout"],
    panes: [
      {
        name: "checks",
        lines: [
          { kind: "start", text: "[agent checks started]" },
          { kind: "tool", text: "▶ bash {\"command\":\"gh pr checks 482\"}" },
          { kind: "error", text: "✖ migration / postgres-16" },
          { kind: "tool", text: "▶ bash {\"command\":\"gh run view 9912 --log-failed\"}" },
          { kind: "code", text: "ERROR: column \"email\" contains null values" },
          { kind: "response", text: "Failure is deterministic, not flaky." },
          { kind: "done", text: "[agent checks exited 0]" },
        ],
      },
      {
        name: "migration-sql",
        lines: [
          { kind: "start", text: "[agent migration-sql started]" },
          { kind: "tool", text: "▶ read {\"path\":\"db/migrate/20260723_email.sql\"}" },
          { kind: "success", text: "✔ ALTER COLUMN email SET NOT NULL" },
          { kind: "tool", text: "▶ bash {\"command\":\"rg 'email IS NULL' db src\"}" },
          { kind: "error", text: "✖ no backfill found" },
          { kind: "response", text: "37 legacy rows violate the new invariant." },
          { kind: "done", text: "[agent migration-sql exited 0]" },
        ],
      },
      {
        name: "rollout-review",
        lines: [
          { kind: "start", text: "[agent rollout-review started]" },
          { kind: "tool", text: "▶ bash {\"command\":\"git diff origin/main...HEAD -- db/\"}" },
          { kind: "thinking", text: "· thinking ·  Checking lock and rollback risk" },
          { kind: "response", text: "Block merge: SET NOT NULL scans and locks the table." },
          { kind: "response", text: "Backfill → NOT VALID check → validate → NOT NULL." },
          { kind: "response", text: "Rollback should drop only the constraint." },
          { kind: "done", text: "[agent rollout-review exited 0]" },
        ],
      },
    ],
  },
];

export default function Demos() {
  const [active, setActive] = React.useState(SCENARIOS[0].id);
  const scenario = SCENARIOS.find((item) => item.id === active);

  function moveTab(event, index) {
    const moves = { ArrowLeft: -1, ArrowRight: 1, Home: -index, End: SCENARIOS.length - index - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = (index + moves[event.key] + SCENARIOS.length) % SCENARIOS.length;
    setActive(SCENARIOS[next].id);
    document.getElementById(`demo-tab-${SCENARIOS[next].id}`)?.focus();
  }

  return (
    <div className="demo-shell">
      <div className="demo-tabs" role="tablist" aria-label="pibarm agent use cases">
        {SCENARIOS.map((item, index) => (
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

      <div id={`demo-panel-${scenario.id}`} className="demo-panel" role="tabpanel" aria-labelledby={`demo-tab-${scenario.id}`}>
        <div className="demo-cap">
          <span className="demo-cap-no">{scenario.number}</span>
          <h3 className="demo-cap-title">{scenario.title}</h3>
          <span className="demo-cap-note">{scenario.note}</span>
        </div>

        <div className="demo-parent-prompt">
          <span>1:pi ›</span>
          <p>{scenario.prompt}</p>
        </div>

        <AgentPanesDemo key={scenario.id} scenario={scenario} />

        <div className="demo-scenario-notes">
          <p className="demo-note">{scenario.description}</p>
          <div>
            <p className="demo-result"><b>Parent result</b> {scenario.result}</p>
            <div className="demo-tags">
              {scenario.tags.map((tag) => <span className="demo-tag demo-tag--info" key={tag}>● {tag}</span>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
