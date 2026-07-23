import { Badge, CommandRow } from "pibarm-ds";

const stack: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 10 };

/** The command reference as the docs page renders it. */
export const Reference = () => (
  <div style={stack}>
    <CommandRow name="/plan" args="<task>">
      Enter read-only plan mode and ask for a plan.
    </CommandRow>
    <CommandRow name="/execute-plan" args="worktree <name>" trailing={<Badge tone="success">safe</Badge>}>
      Execute the captured plan in a new repo-local git worktree.
    </CommandRow>
    <CommandRow name="/agents" args="[name]" trailing={<Badge tone="accent">panes</Badge>}>
      List managed agents or capture one agent log.
    </CommandRow>
    <CommandRow name="/repo-status">
      Show git / forge / CI status and update the statusline.
    </CommandRow>
  </div>
);

export const NoArgs = () => (
  <div style={stack}>
    <CommandRow name="/obsidian-export">Export the current session to your Obsidian vault.</CommandRow>
  </div>
);
