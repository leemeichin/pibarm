// pibarm site — shared content data. Ported from the prototype's data.js.

export interface Feature {
  icon: string;
  eyebrow: string;
  title: string;
  body: string;
}

export const FEATURES: Feature[] = [
  { icon: "clipboard-list", eyebrow: "Plan mode", title: "Plan first, edit later", body: "pi inspects read-only and asks explicit questions before it proposes a plan. edit and write stay disabled until you approve." },
  { icon: "git-branch", eyebrow: "Worktrees", title: "Risky work, isolated", body: "Execute plans in a repo-local git worktree instead of your active checkout. Review the diff, then merge or bin it." },
  { icon: "layers", eyebrow: "Matrix", title: "Visible parallel agents", body: "Spawn scout, planner and worker agents beside the parent Pi in WezTerm panes you can watch, capture, and join." },
  { icon: "sliders-horizontal", eyebrow: "Presets", title: "Right model for the role", body: "Switch model, thinking level and active tools per role. Planners read; executors write; simple jobs use lighter models." },
  { icon: "bell", eyebrow: "Watchers", title: "Sibling agents that wait", body: "A watcher polls a PR or external state and only runs when something changes — follow-up without babysitting." },
  { icon: "notebook-pen", eyebrow: "Obsidian", title: "Sessions, exported", body: "Auto-sync each session to your Obsidian vault, debounced after turns and compaction. Your notes, your machine." },
];

export interface Command {
  name: string;
  args: string;
  desc: string;
  tag: "safe" | "wezterm" | null;
}

export const COMMANDS: Command[] = [
  { name: "/plan", args: "<task>", desc: "Enter read-only plan mode and ask for a plan.", tag: null },
  { name: "/execute-plan", args: "worktree <name>", desc: "Execute the captured plan in a new repo-local git worktree.", tag: "safe" },
  { name: "/worktree-diff", args: "<path>", desc: "Show status + diff stat for a worktree before you merge.", tag: null },
  { name: "/matrix", args: "<task>", desc: "Start a WezTerm Matrix with scout and planner panes.", tag: "wezterm" },
  { name: "/matrix-spawn", args: "<role> <task>", desc: "Spawn one Matrix agent in a WezTerm pane.", tag: "wezterm" },
  { name: "/matrix-join", args: "[role|all]", desc: "Wait for agents, capture logs, and clean up panes.", tag: "wezterm" },
  { name: "/preset", args: "planner", desc: "Apply the planner model / tool / thinking preset.", tag: null },
  { name: "/repo-status", args: "", desc: "Show git / forge / CI status and update the statusline.", tag: null },
  { name: "/review", args: "[#number|url]", desc: "Start a PR / patch review; findings posted inline.", tag: null },
  { name: "/obsidian-export", args: "", desc: "Export the current session to your Obsidian vault.", tag: null },
];

export interface SessionStep {
  k: "cmd" | "dim" | "info" | "you" | "ok" | "err" | "warn";
  t: string;
  d: number;
}

// scripted pi session (plan -> execute in a worktree)
export const SESSION: SessionStep[] = [
  { k: "cmd", t: "/plan add a retry to the flaky worker", d: 34 },
  { k: "dim", t: "plan mode · read-only — inspecting repo", d: 380 },
  { k: "dim", t: "  read  lib/task-widget.ts", d: 200 },
  { k: "dim", t: "  read  extensions/watch-agent.ts", d: 200 },
  { k: "info", t: "? Which retry strategy — fixed, or exponential backoff?", d: 520 },
  { k: "you", t: "exponential, max 3", d: 700 },
  { k: "ok", t: "✓ plan captured · 4 steps · worktree recommended", d: 460 },
  { k: "cmd", t: "/execute-plan worktree retry-worker", d: 40 },
  { k: "dim", t: "  worktree  .pi/wt/retry-worker  ⟶  pibarm/retry-worker", d: 420 },
  { k: "dim", t: "  edit  extensions/watch-agent.ts", d: 300 },
  { k: "dim", t: "  edit  lib/task-widget.ts", d: 300 },
  { k: "ok", t: "✓ done · 2 files changed, +38 −6", d: 420 },
  { k: "dim", t: "  review with /worktree-diff .pi/wt/retry-worker", d: 300 },
];
