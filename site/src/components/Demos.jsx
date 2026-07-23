import React from "react";
import AgentPanesDemo from "./AgentPanes.jsx";

const DEMOS = [
  {
    id: "matrix",
    number: "01",
    label: "Matrix",
    title: "Turn an issue backlog into safe work",
    note: "scout → plan → worktree → watch",
    description: "The parent coordinates in one full-height Pi pane while scout, planner, and worktree agents stream beside it. Results return to the parent task widget instead of becoming three disconnected chats.",
    result: "Four tickets become one dependency-aware queue; the first unblocked fix lands in an isolated worktree and opens a watched PR.",
    tags: ["parallel agents", "isolated worktree", "PR watcher"],
  },
  {
    id: "review",
    number: "02",
    label: "PR + CI",
    title: "Review a PR, then keep it moving",
    note: "repo status → failed check → review → watcher",
    project: "auth-service",
    branch: "feature/auth-guard",
    model: "gpt-5.6-sol · high",
    prompt: "Review PR #108. Start with failed checks, leave only actionable findings, then keep watching for CI or reviewer changes.",
    description: "Forge-neutral status and CI tools establish the state before review. Once the useful finding is posted, a watcher waits off-screen and wakes the parent only when the PR changes.",
    result: "One blocking Node 22 path bug is posted inline; passing tests are not re-run, and the watcher owns follow-up.",
    tags: ["GitHub or SourceHut", "CI triage", "watcher"],
    task: { kind: "watch pr", label: "#108 review + CI" },
    lines: [
      { kind: "thinking", text: "Thinking..." },
      { kind: "output", text: "I’ll establish repository and check state before reviewing the diff." },
      { kind: "tool", text: "search_tools  repository · forge · watcher" },
      { kind: "output", text: "Enabled repo_status, forge_ci_status, watch_agent" },
      { kind: "output", text: "" },
      { kind: "tool", text: "repo_status" },
      { kind: "output", text: "auth-service (feature/auth-guard)" },
      { kind: "output", text: "PR #108 open · 3 files changed · +42 −11" },
      { kind: "error", text: "CI  lint / node-22 failed · tests passed" },
      { kind: "output", text: "" },
      { kind: "thinking", text: "Thinking..." },
      { kind: "output", text: "The lone failed check is the likely blocker; inspect it before commenting." },
      { kind: "tool", text: "forge_ci_status  {\"pr\":\"108\"}" },
      { kind: "output", text: "lint / node-22" },
      { kind: "output", text: "scripts/check-path.mjs:17  expected repository root" },
      { kind: "tool", text: "review  #108" },
      { kind: "response", text: "P1  Resolve paths from import.meta.url; process.cwd() changes in the Node 22 job." },
      { kind: "tool", text: "watch_agent  {\"action\":\"start\",\"pr\":\"108\"}" },
      { kind: "success", text: "Watcher started: review comments + CI changes" },
    ],
  },
  {
    id: "intel",
    number: "03",
    label: "Code intel",
    title: "Trace a bug semantically",
    note: "definition → references → diagnostics",
    project: "checkout-api",
    branch: "bug/cart-total",
    model: "gpt-5.6-sol · high",
    prompt: "Why can checkoutTotal return undefined? Trace the symbol and every caller before suggesting a fix.",
    description: "Pi loads managed Serena only when semantic navigation is useful, then follows definitions and references instead of guessing from filename matches. Paths remain inside the trusted project.",
    result: "The shared normalizer has one missing return, affecting both API and worker callers; one root fix covers both paths.",
    tags: ["deferred tool", "Serena", "root-cause fix"],
    lines: [
      { kind: "thinking", text: "Thinking..." },
      { kind: "output", text: "A symbol lookup will avoid confusing this helper with similarly named totals." },
      { kind: "tool", text: "search_tools  managed code intelligence" },
      { kind: "output", text: "Enabled code_intel · Serena TypeScript server ready" },
      { kind: "output", text: "" },
      { kind: "tool", text: "code_intel  find_symbol · checkoutTotal" },
      { kind: "output", text: "src/cart/total.ts:18-33" },
      { kind: "code", text: "export function checkoutTotal(cart): number | undefined" },
      { kind: "tool", text: "code_intel  find_references · checkoutTotal" },
      { kind: "output", text: "api/checkout.ts:44    const total = checkoutTotal(cart)" },
      { kind: "output", text: "jobs/reprice.ts:71    checkoutTotal(pendingCart)" },
      { kind: "output", text: "" },
      { kind: "thinking", text: "Thinking..." },
      { kind: "output", text: "Both callers share this definition; confirm the missing path diagnostically." },
      { kind: "tool", text: "code_intel  diagnostics · src/cart/total.ts" },
      { kind: "error", text: "TS7030  line 31  Not all code paths return a value" },
      { kind: "response", text: "The shared empty-cart branch misses return 0; one fix covers both callers." },
    ],
  },
  {
    id: "mcp",
    number: "04",
    label: "MCP",
    title: "Pull external context only when needed",
    note: "discover server → inspect tool → call",
    project: "storefront",
    branch: "incident/checkout",
    model: "gpt-5.6-sol · medium",
    prompt: "Check Linear for customer-reported checkout regressions from this week and compare them with the bug we just reproduced.",
    description: "mcporter keeps external MCP schemas out of the base prompt. Pi discovers the matching server and tool on demand, then makes one bounded call with no credentials committed to the repo.",
    result: "Two reports share the same percentage-discount signature; the unrelated mobile timeout stays out of scope.",
    tags: ["mcporter", "on-demand schema", "local credentials"],
    lines: [
      { kind: "thinking", text: "Thinking..." },
      { kind: "output", text: "Discover the Linear schema first; don’t load unrelated MCP tools." },
      { kind: "tool", text: "search_tools  MCP discovery and calls" },
      { kind: "output", text: "Enabled mcporter_list, mcporter_call, mcporter_resource" },
      { kind: "output", text: "" },
      { kind: "tool", text: "mcporter_list  {\"query\":\"linear issues\"}" },
      { kind: "output", text: "linear" },
      { kind: "output", text: "  list_issues  Search team issues with filters" },
      { kind: "output", text: "  get_issue    Read one issue by identifier" },
      { kind: "tool", text: "mcporter_call  linear.list_issues" },
      { kind: "output", text: "team=Checkout · createdAt=-P7D · state!=Done" },
      { kind: "code", text: "CHK-241  Discount makes total negative" },
      { kind: "code", text: "CHK-245  Coupon checkout shows -£228.00" },
      { kind: "dim", text: "CHK-247  Mobile timeout after payment" },
      { kind: "output", text: "" },
      { kind: "thinking", text: "Thinking..." },
      { kind: "output", text: "Two reports share the negative-total signature; the timeout has another path." },
      { kind: "response", text: "CHK-241 and CHK-245 match the reproduced bug; CHK-247 is unrelated." },
    ],
  },
];

function FeatureTerminal({ demo }) {
  const [frame, setFrame] = React.useState(0);

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFrame(demo.lines.length);
      return;
    }
    const timer = window.setInterval(
      () => setFrame((current) => (current >= demo.lines.length + 4 ? 0 : current + 1)),
      500,
    );
    return () => window.clearInterval(timer);
  }, [demo]);

  return (
    <div className="feature-terminal" aria-label={`${demo.title}: Pi terminal replay`}>
      <div className="agent-terminal__chrome">
        <div className="pib-term__dots" aria-hidden="true">
          <span className="pib-term__dot" style={{ background: "#e0685b" }} />
          <span className="pib-term__dot" style={{ background: "#e6b02c" }} />
          <span className="pib-term__dot" style={{ background: "#6fa84c" }} />
        </div>
        <span>pi — {demo.project}</span>
      </div>
      <div className="feature-terminal__body">
        <div className="demo-user-message">
          <span>YOU</span>
          <p>{demo.prompt}</p>
        </div>
        <div className="feature-terminal__transcript">
          {demo.lines.slice(0, frame).map((line, index) => (
            <div className={`agent-terminal__line agent-terminal__line--${line.kind}`} key={index}>{line.text}</div>
          ))}
          {frame > 0 && frame < demo.lines.length && <span className="pib-term__caret" aria-hidden="true" />}
        </div>
      </div>
      {demo.task && frame >= demo.lines.length && (
        <div className="feature-terminal__tasks">
          <span className="pib-pill pib-pill--bare pib-pill--running">
            <span className="pib-pill__gl">‹</span><span className="pib-pill__ic">●</span>
            <span className="pib-pill__kind">{demo.task.kind}</span><span className="pib-pill__sep">·</span>
            <span className="pib-pill__lbl">{demo.task.label}</span><span className="pib-pill__gl">›</span>
          </span>
        </div>
      )}
      <div className="feature-terminal__status">
        <span>{demo.project} ({demo.branch})</span>
        <span>{demo.model}</span>
      </div>
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
      <div className="demo-tabs" role="tablist" aria-label="pibarm capability demos">
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

        {demo.id === "matrix" ? <AgentPanesDemo /> : <FeatureTerminal key={demo.id} demo={demo} />}

        <div className="demo-scenario-notes">
          <p className="demo-note">{demo.description}</p>
          <div>
            <p className="demo-result"><b>Result</b> {demo.result}</p>
            <div className="demo-tags">
              {demo.tags.map((tag) => <span className="demo-tag" key={tag}>● {tag}</span>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
