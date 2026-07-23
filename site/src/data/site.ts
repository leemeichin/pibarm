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
  { icon: "layers", eyebrow: "Agent panes", title: "Visible parallel agents", body: "Standard subagent and worktree tools stream into automatic tmux or Zellij panes, with the same captured results and a headless fallback." },
  { icon: "sliders-horizontal", eyebrow: "Presets", title: "Right model for the role", body: "Switch model, thinking level and active tools per role. Planners read; executors write; simple jobs use lighter models." },
  { icon: "bell", eyebrow: "Watchers", title: "Sibling agents that wait", body: "A watcher polls a PR or external state and only runs when something changes — follow-up without babysitting." },
  { icon: "notebook-pen", eyebrow: "Obsidian", title: "Sessions, exported", body: "Auto-sync each session to your Obsidian vault, debounced after turns and compaction. Your notes, your machine." },
];

export interface Command {
  name: string;
  args: string;
  desc: string;
  tag: "safe" | "panes" | null;
}

export const COMMANDS: Command[] = [
  { name: "/plan", args: "<task>", desc: "Enter read-only plan mode and ask for a plan.", tag: null },
  { name: "/execute-plan", args: "worktree <name>", desc: "Execute the captured plan in a new repo-local git worktree.", tag: "safe" },
  { name: "/worktree-diff", args: "<path>", desc: "Show status + diff stat for a worktree before you merge.", tag: null },
  { name: "/agents", args: "[name]", desc: "List managed agents or capture one agent log.", tag: "panes" },
  { name: "/agents-attach", args: "", desc: "Focus a managed pane or show its attach command.", tag: "panes" },
  { name: "/agents-kill", args: "[name|all]", desc: "Stop managed panes without touching the parent session.", tag: "panes" },
  { name: "/preset", args: "planner", desc: "Apply the planner model / tool / thinking preset.", tag: null },
  { name: "/repo-status", args: "", desc: "Show git / forge / CI status and update the statusline.", tag: null },
  { name: "/review", args: "[#number|url]", desc: "Start a PR / patch review; findings posted inline.", tag: null },
  { name: "/obsidian-export", args: "", desc: "Export the current session to your Obsidian vault.", tag: null },
];
