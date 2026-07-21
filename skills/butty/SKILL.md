---
name: butty
description: Use parent-controlled WezTerm Butty panes for visible multi-agent orchestration. Use when the user asks for Butty, WezTerm panes/tabs/splits, visible subagents, or multi-agent cockpit workflows.
---

# Butty

Butty is a visible cockpit. It is opt-in unless `pibarm.butty.autoSpawn` is enabled in Pi settings. If its tools are inactive, enable the Butty group with `search_tools` first.

Use it when parallel work benefits from observation:

- scout code while parent keeps talking
- compare planner/reviewer opinions
- run a worker in a separate worktree
- keep a TUI/log/test command visible beside Pi

When auto-spawn is off, prefer `run_subagent`/`run_subagents` for cheap headless checks where visibility does not matter. When it is on, those tools are replaced by Butty spawn/join tools for isolated delegation; worktree agents and watchers stay unchanged.

## Commands

```text
/butty-help
/butty <task>
/butty-attach
/butty-spawn <role> <task>
/butty-capture [role]
/butty-join [role|all]
/butty-list
/butty-kill [role|all]
/butty-kill-orphans
```

## Workflow

1. Start the cockpit:

```text
/butty-attach
```

2. Spawn read-only context agents first:

```text
/butty-spawn scout map the auth flow
/butty-spawn planner propose the smallest safe plan
```

3. Join before acting; this waits for completion, returns logs, and removes only the joined agent panes:

```text
/butty-join
```

4. Spawn workers only when the work is clear:

- same branch/distributed work: no worktree
- separate branch or risky changes: `butty_spawn` with `worktree: true`
- current-tab agents automatically form a horizontal row below the full-width parent; use `butty_spawn.placement` with `tab` or `window` to opt out
- Butty limits the parent tab to three agents; a fourth asks for confirmation, then opens the fourth and later agents in a new window when approved
- Butty immediately returns input focus to the parent, streams each agent's reasoning/response/tool activity live, logs the same transcript to `.pi/butty/`, shows agent pills in the shared task widget, and uses a dedicated workspace only when Pi is outside WezTerm

5. For an issue-to-PR loop, join the triage agents, process one unblocked issue at a time with a worktree worker, and start `watch_agent` for each pull request's reviews and CI before continuing.

6. Clean up:

```text
/butty-kill all
```

## Roles

- `scout`: read-focused recon; defaults to current model, with a lighter authenticated model for simple-scope tasks
- `planner`: read-only plan/risk pass; defaults to current model, with a lighter authenticated model for simple-scope tasks
- `worker`: implementation, can write; defaults to current model, with a lighter authenticated model for simple-scope tasks
- `reviewer`: read-focused review/check pass; defaults to current model, with a lighter authenticated model for simple-scope tasks

## Rules

- Parent Pi remains the source of truth.
- Use `butty_join` after spawning agents so completion, logs, and cleanup are synchronized.
- Do not bypass the three-agent confirmation by forcing extra current-tab splits.
- Butty agents run non-interactively (`pi -p`) and cannot receive input mid-run; to give new instructions, `butty_join` the agent and spawn a follow-up with the extra context.
- Do not run multiple writing workers in the same checkout unless files are clearly disjoint.
- Use `butty_kill all` to kill only this session's tracked agent panes; `/butty-kill-orphans` cleans up legacy/fallback dedicated Butty workspaces.
