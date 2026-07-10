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
/matrix-join [role|all]
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

3. Join before acting; this waits for completion, returns logs, and cleans up panes:

```text
/matrix-join
```

4. Spawn workers only when the work is clear:

- same branch/distributed work: no worktree
- separate branch or risky changes: `matrix_spawn` with `worktree: true`
- use `matrix_spawn.placement` for `right`, `down`, or `tab` when placement matters
- Matrix uses a project/session-specific workspace name, opens/focuses it automatically, reuses one workspace window where possible, logs to `.pi/matrix/`, and panes exit when done

5. Clean up:

```text
/matrix-kill all
```

## Roles

- `scout`: read-focused recon; defaults to current model, with a lighter authenticated model for simple-scope tasks
- `planner`: read-only plan/risk pass; defaults to current model, with a lighter authenticated model for simple-scope tasks
- `worker`: implementation, can write; defaults to current model, with a lighter authenticated model for simple-scope tasks
- `reviewer`: read-focused review/check pass; defaults to current model, with a lighter authenticated model for simple-scope tasks

## Rules

- Parent Pi remains the source of truth.
- Use `matrix_join` after spawning agents so completion, logs, and cleanup are synchronized.
- Use `matrix_send` only while a Matrix agent is still active.
- Do not run multiple writing workers in the same checkout unless files are clearly disjoint.
- Use `matrix_kill all` to force-clean tracked and untracked Matrix workspace panes.
