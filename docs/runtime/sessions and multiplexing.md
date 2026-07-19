---
title: sessions and multiplexing
stage: design
status: draft
created: 2026-07-19
tags:
  - pibarm
  - runtime
  - design
hub: "[[pibarm runtime design]]"
---

# sessions and multiplexing

How the Matrix stops being a WezTerm feature and becomes a runtime one ([[pibarm runtime design]] D5). Serves PRD F4, plus the agent rows of the [[parity matrix]].

## The generalisation

Today `matrix.ts` spawns pi processes into WezTerm panes and tracks them loosely. In the runtime model:

- A **session** owns a tree of **agents**. The root agent is the interactive session; children are Matrix agents, subagents (`run_subagent(s)`), worktree agents, and watchers' one-shot task runs.
- Every agent is a host-managed pi driver with its own journal (child journals are linked from the parent's `agent_spawned` events).
- **Rendering is the client's problem.** The CLI maps agents onto WezTerm panes as before; the web renders a pane grid of components; macOS renders native panes. Same tree, three renderers.

This collapses four spawning mechanisms (`matrix_spawn`, `run_subagent`, `run_subagents`, `run_worktree_agent`) onto one host primitive with different presets — the tools keep their names and schemas for compatibility, but they become sugar over `agent.spawn`.

## Agent model

```json
{
  "id": "a-7f2",
  "parent": "root",
  "role": "scout",
  "task": "triage every open issue…",
  "model": "inherit",
  "toolset": "read-only",
  "worktree": null,
  "visibility": "visible",
  "state": "running",
  "started": "…",
  "ended": null
}
```

- **Roles** keep today's semantics: `scout`/`planner` read-focused toolsets, `worker` normal tools. Toolsets are host policy (safety invariant), not client hints.
- **`visibility`**: `visible` (a pane the user should see — Matrix behaviour) vs `background` (subagent/watcher-run — task pill only). The old distinction between Matrix agents and headless subagents becomes this one field; `matrix.autoSpawn` maps to a default.
- **`worktree`**: optional isolation, same `.pi/wt/` + `pibarm/<name>` branch scheme via the worktree service.
- Agents remain **non-interactive mid-run** (today's rule): to redirect one, join it and spawn a successor. The protocol reserves an `agent.message` verb for the future but v0 does not implement it — parity first, new capability later.

## Pane policy

Today's WezTerm ergonomics become host policy so every surface enforces the same shape (parity invariant):

- Parent stays primary; up to **three concurrent visible agents** by default (`pibarm.matrix.maxVisible`).
- Requesting a fourth visible agent raises a `question_open` (confirm-type) — on approval the surplus agents go to an "overflow" group, which the CLI renders as a new window (as today), web renders as a second grid row/tab, macOS as a separate window.
- Background agents are unlimited except by host concurrency settings.

## Lifecycle verbs

| Verb            | Semantics (unchanged from today where they exist)                                       |
| --------------- | --------------------------------------------------------------------------------------- |
| `agent.spawn`   | create child; role/toolset/worktree/visibility; returns id immediately                  |
| `agent.list`    | live registry — no pane scraping, so `-orphans` cleanup becomes host GC of dead drivers |
| `agent.capture` | read tail of the child journal (bounded)                                                |
| `agent.join`    | await completion of one/all; returns final outputs; marks panes collapsible             |
| `agent.kill`    | terminate child; parent unaffected                                                      |

Join folds results into the parent as `tool_result`-style journal events, so the parent model wakes with the same context it gets today from `matrix_join`.

## Surface rendering

- **CLI (attached mode)**: subscribes to agent events, drives WezTerm panes exactly as `matrix.ts` does now; standalone CLI keeps the current code path.
- **Web** ([[web client]]): grid of agent panes built from pibarm-ds Terminal/TaskPill components; streaming transcript per pane; join/kill controls; overflow as tabs.
- **macOS** ([[macos app]]): native split grid, per-agent windows on demand, focus follows keyboard shortcuts mirroring `/matrix-attach`.
- The **task widget** is the compact projection of the same registry: `task.list` returns todos + agents + watchers; clients render pills (ds `TaskPill`) identical in content to the TUI's.

## Issue seeds (M1–M3)

- unify spawn paths onto `agent.spawn` presets behind existing tool names
- agent registry + GC (replaces pane-tracking and `-orphans` logic)
- pane policy in host settings + confirm flow
- child journal linking + `agent.capture/join` semantics
- CLI attached-mode WezTerm renderer
- web agent grid; macOS agent grid (tracked in their surface notes)

## Related

[[pibarm runtime design]] · [[runtime core and protocol]] · [[parity matrix]] · [[web client]] · [[macos app]]
