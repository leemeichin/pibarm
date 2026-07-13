import { Callout } from "pibarm-ds";

const stack: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12 };

export const Tones = () => (
  <div style={stack}>
    <Callout tone="note" title="Nerd Font glyphs">
      The TUI uses Nerd Font icons for the statusline and task widget. Install a Nerd Font, or they
      render as boxes.
    </Callout>
    <Callout tone="tip" title="Isolated branches">
      Pass <code>worktree: true</code> on <code>matrix_spawn</code> and the agent gets its own branch
      and worktree for separate work.
    </Callout>
    <Callout tone="warning" title="Plan mode is read-only">
      <code>edit</code> and <code>write</code> are disabled and bash is restricted until you approve
      the captured plan.
    </Callout>
    <Callout tone="danger" title="This bins the worktree">
      Discarding a worktree throws away every uncommitted change in it. There is no undo.
    </Callout>
  </div>
);

export const Untitled = () => (
  <div style={stack}>
    <Callout tone="tip">
      Parent-controlled panes mean you can watch, message, and capture each agent's output live.
    </Callout>
  </div>
);
