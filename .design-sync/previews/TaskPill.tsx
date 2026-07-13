import { TaskPill } from "pibarm-ds";

const row: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" };

export const Statuses = () => (
  <div style={row}>
    <TaskPill status="todo" index={1} label="inspect auth" />
    <TaskPill status="running" index={2} label="add retry to worker" />
    <TaskPill status="done" index={3} label="update task widget" />
    <TaskPill status="failed" index={4} label="flaky integration test" />
  </div>
);

/** The task widget as pibarm renders it below the editor: role, label, elapsed. */
export const DelegatedAgents = () => (
  <div style={{ ...row, flexDirection: "column", alignItems: "flex-start" }}>
    <TaskPill status="done" index={1} kind="scout" label="map the auth flow" meta="18s" />
    <TaskPill status="running" index={2} kind="planner" label="plan the retry" meta="4s" />
    <TaskPill status="todo" index={3} kind="worker" label="fix and verify" />
  </div>
);

/** The terminal-native form on the dark terminal ground. */
export const TerminalForm = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 4,
      background: "var(--surface-code)",
      padding: "14px 16px",
      borderRadius: "var(--radius-md)",
      fontFamily: "var(--font-mono)",
      alignItems: "flex-start",
    }}
  >
    <TaskPill variant="term" status="done" index={1} kind="scout" label="map the auth flow" meta="18s" />
    <TaskPill variant="term" status="running" index={2} kind="planner" label="plan the retry" meta="4s" />
    <TaskPill variant="term" status="todo" index={3} kind="worker" label="fix and verify" />
  </div>
);
