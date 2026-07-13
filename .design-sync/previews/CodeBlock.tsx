import { CodeBlock } from "pibarm-ds";

const stack: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 14 };

export const Install = () => (
  <div style={stack}>
    <CodeBlock language="bash" code="pi install git@github.com:leemeichin/pibarm.git" />
  </div>
);

export const Workflow = () => (
  <div style={stack}>
    <CodeBlock
      language="text"
      code={`/plan <task>
  ↓  read-only — pi inspects, asks, and captures a plan
/approve-plan worktree <name>
  ↓  changes happen in .pi/wt/<name>, not your checkout
/worktree-diff .pi/wt/<name>`}
    />
  </div>
);

export const NotCopyable = () => (
  <div style={stack}>
    <CodeBlock
      language="bash"
      copyable={false}
      code={`matrix_spawn role=scout task="map the auth flow"
matrix_join role=all`}
    />
  </div>
);
