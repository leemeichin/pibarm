import { Terminal } from "pibarm-ds";

/** A real pi session: plan mode asks before it acts, then executes in a worktree. */
export const PlanSession = () => (
  <Terminal title="pi — <b>pibarm</b>">
    <div className="cmd">
      <span className="slash">/plan</span> add a retry to the flaky worker
    </div>
    <div className="dim">plan mode · read-only — inspecting repo</div>
    <div className="dim"> read lib/task-widget.ts</div>
    <div className="dim"> read extensions/watch-agent.ts</div>
    <div className="info">? Which retry strategy — fixed, or exponential backoff?</div>
    <div>exponential, max 3</div>
    <div className="ok">✓ plan captured · 4 steps · worktree recommended</div>
    {"\n"}
    <div className="cmd">
      <span className="slash">/execute-plan</span> worktree retry-worker
    </div>
    <div className="dim"> worktree .pi/wt/retry-worker ⟶ pibarm/retry-worker</div>
    <div className="dim"> edit extensions/watch-agent.ts</div>
    <div className="ok">✓ done · 2 files changed, +38 −6</div>
    <span className="pib-term__caret" />
  </Terminal>
);

export const StatusMessages = () => (
  <Terminal title="pi — <b>pibarm</b>" height={190}>
    <div className="ok">✓ pass — all 24 tests green</div>
    <div className="warn">▲ CI still running on #128</div>
    <div className="err">! failed — worktree is dirty, refusing to merge</div>
    <div className="info">ℹ 3 agents joined, panes closed</div>
    <div className="dim">nothing else to do, ar kid</div>
  </Terminal>
);

export const Fixed = () => (
  <Terminal title="pi — <b>matrix</b>" height={150}>
    <div className="cmd">
      <span className="slash">/matrix</span> fix the flaky worker
    </div>
    <div className="dim"> spawn scout · planner in WezTerm panes</div>
    <div className="ok">✓ 2 agents running</div>
  </Terminal>
);
