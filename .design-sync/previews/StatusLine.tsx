import { StatusLine } from "pibarm-ds";

const stack: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 14 };

/** The statusline as the site shows it: a dirty branch with an open PR and CI running. */
export const Panel = () => (
  <div style={stack}>
    <StatusLine
      project="pibarm"
      model="anthropic/Sonnet 4.5"
      context={41}
      branch="fix-flaky"
      dirty={3}
      pr={{ num: 128, state: "open" }}
      ci="running"
    />
  </div>
);

export const CiStates = () => (
  <div style={stack}>
    <StatusLine branch="main" dirty={0} pr={{ num: 12, state: "open" }} ci="pass" />
    <StatusLine branch="retry-worker" dirty={2} pr={{ num: 13, state: "draft" }} ci="running" />
    <StatusLine branch="hotfix" dirty={1} pr={{ num: 14, state: "closed" }} ci="fail" />
    <StatusLine branch="release" dirty={0} pr={{ num: 11, state: "merged" }} ci="pass" />
  </div>
);

/** No PR yet — the segment drops out entirely. */
export const NoPullRequest = () => (
  <div style={stack}>
    <StatusLine project="pibarm" branch="spike" dirty={7} pr={null} ci="unknown" />
  </div>
);

/** The terminal-native form: flat line, no panel chrome — dark and light grounds. */
export const TerminalForms = () => (
  <div style={stack}>
    <div style={{ background: "var(--surface-code)", padding: "10px 12px", borderRadius: "var(--radius-md)" }}>
      <StatusLine variant="bare" theme="dark" branch="fix-flaky" dirty={3} pr={{ num: 128, state: "open" }} ci="running" />
    </div>
    <div style={{ background: "var(--cream-50)", padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--sand-400)" }}>
      <StatusLine variant="bare" theme="light" branch="fix-flaky" dirty={3} pr={{ num: 128, state: "open" }} ci="running" />
    </div>
  </div>
);
