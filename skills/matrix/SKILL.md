---
name: matrix
description: Use parent-controlled WezTerm Matrix panes for visible multi-agent orchestration. Use when the user asks for Matrix, WezTerm panes/tabs/splits, visible subagents, or multi-agent cockpit workflows.
---

# Matrix

Matrix is a visible cockpit, not the default way to do every task.

Use it when parallel work benefits from observation:

- scout code while parent keeps talking
- compare planner/reviewer opinions
- run a worker in a separate worktree
- keep a TUI/log/test command visible beside Pi

Prefer `run_subagent`/`run_subagents` for cheap headless checks where visibility does not matter.

## Commands

```text
/matrix-help
/matrix <task>
/matrix-attach
/matrix-spawn <role> <task>
/matrix-send <role> <message>
/matrix-capture [role]
/matrix-kill [role|all]
```

## Workflow

1. Start the cockpit:

```text
/matrix-attach
```

2. Spawn read-only context agents first:

```text
/matrix-spawn scout map the auth flow
/matrix-spawn planner propose the smallest safe plan
```

3. Capture before acting:

```text
/matrix-capture
```

4. Spawn workers only when the work is clear:

- same branch/distributed work: no worktree
- separate branch or risky changes: `matrix_spawn` with `worktree: true`
- use `matrix_spawn.placement` for `right`, `down`, `tab`, or `window` when placement matters

5. Clean up:

```text
/matrix-kill all
```

## Roles

- `scout`: read-focused recon, cheap model
- `planner`: read-only plan/risk pass
- `worker`: implementation, can write
- `reviewer`: read-focused review/check pass

## Rules

- Parent Pi remains the source of truth.
- Always capture pane output before summarizing or acting on it.
- Do not run multiple writing workers in the same checkout unless files are clearly disjoint.
- Kill panes after completion unless the user asks to keep them.
