import { Card, Icon } from "pibarm-ds";

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 18,
};

export const Feature = () => (
  <div style={grid}>
    <Card eyebrow="Plan mode" title="Plan first, edit later">
      pi inspects read-only and asks explicit questions before it proposes a plan. edit and write
      stay disabled until you approve.
    </Card>
    <Card eyebrow="Worktrees" title="Risky work, isolated">
      Execute plans in a repo-local git worktree instead of your active checkout. Review the diff,
      then merge or bin it.
    </Card>
  </div>
);

export const WithIcon = () => (
  <div style={grid}>
    <Card
      icon={<Icon name="layers" size={20} />}
      eyebrow="Matrix"
      title="Visible parallel agents"
    >
      Spawn scout, planner and worker agents in WezTerm panes you can watch, message, and join —
      orchestration you can see.
    </Card>
  </div>
);

export const Accent = () => (
  <div style={grid}>
    <Card accent eyebrow="Presets" title="Right model for the role">
      Switch model, thinking level and active tools per role. Planners read; executors write; simple
      jobs use lighter models.
    </Card>
  </div>
);

export const Interactive = () => (
  <div style={grid}>
    <Card interactive eyebrow="Obsidian" title="Sessions, exported">
      Auto-sync each session to your Obsidian vault, debounced after turns and compaction. Your
      notes, your machine.
    </Card>
  </div>
);
