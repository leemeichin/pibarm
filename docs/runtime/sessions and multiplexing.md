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

How the shared child-agent runner becomes a runtime service ([[pibarm runtime design]] D5). Serves PRD F4, plus the agent rows of the [[parity matrix]].

## Current CLI baseline

`lib/agent-runner.ts` already collapses `run_subagent`, `run_subagents`, and `run_worktree_agent` onto one execution path:

- The standard tool schemas stay unchanged; configuration chooses only the renderer.
- tmux or a compatible Zellij release available and included by `pibarm.agentPanes` → managed panes stream the agent's JSON event transcript.
- neither multiplexer available, or panes disabled → the same call runs headlessly.
- Inside a multiplexer, pibarm adds panes to the current session. Outside one, it creates a detached native session and prints the attach command. It never controls a terminal application.
- Tool calls still wait, return bounded captured output, update task pills, and honor cancellation/timeouts.
- Watchers remain background task pills.

In the runtime model, the same child primitive moves behind the host:

- A **session** owns a tree of **agents**. The root agent is the interactive session; children are subagents, worktree agents, and watchers' one-shot task runs.
- Every agent is a host-managed pi driver with its own journal (child journals are linked from the parent's `agent_spawned` events).
- **Rendering is the client's problem.** The CLI maps visible agents through tmux or Zellij adapters; the web renders a component grid; macOS renders native panes. Same tree, separate renderers.

## Agent model

```json
{
  "id": "a-7f2",
  "parent": "root",
  "label": "scout",
  "task": "triage every open issue…",
  "model": "inherit",
  "worktree": null,
  "visibility": "visible",
  "state": "running",
  "started": "…",
  "ended": null
}
```

- **`visibility`** is renderer policy: visible agents get a pane; background agents get only a task pill.
- **`worktree`** is optional isolation using the same `.pi/wt/` + `pibarm/<name>` scheme as the worktree service.
- Agents remain **non-interactive mid-run**: redirecting one means cancelling it and starting a successor. The protocol can add an `agent.message` verb later without changing the v0 lifecycle.

## Pane policy

- Parent stays primary; adapters create panes without moving focus.
- Concurrent standard delegation keeps the existing four-agent limit and uses the multiplexer-native tiled/automatic layout without a separate confirmation flow.
- `pibarm.agentPanes.include` selects subagent and/or worktree rendering; `multiplexer` selects `auto`, `tmux`, or `zellij`.
- `outsideMultiplexer` chooses a detached session or headless fallback.
- Background watchers remain governed by host concurrency settings.

## Lifecycle verbs

| Verb                    | Semantics                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `_pibarm/agent/spawn`   | create child; model/worktree/visibility; returns id immediately                         |
| `_pibarm/agent/list`    | live registry independent of client panes                                               |
| `_pibarm/agent/capture` | read a bounded tail of the child journal                                                |
| `_pibarm/agent/join`    | await completion of one/all; standard tool calls use this before returning their result |
| `_pibarm/agent/kill`    | terminate child; parent unaffected                                                      |

Completion folds results into the parent as `tool_result`-style journal events, matching today's standard delegation tools.

## Surface rendering

- **CLI (attached mode)**: subscribes to agent events and drives panes through the tmux control-mode or Zellij CLI adapter; native clients render them.
- **Web** ([[web client]]): grid of agent panes built from pibarm-ds Terminal/TaskPill components; streaming transcript per pane with capture/kill controls.
- **macOS** ([[macos app]]): native split grid and per-agent windows on demand.
- The **task widget** is the compact projection of the same registry: `_pibarm/task/list` returns todos + agents + watchers; clients render equivalent pills.

## Issue seeds (M1–M3)

- move the existing shared runner behind `_pibarm/agent/spawn`
- host agent registry + GC
- child journal linking + capture/join semantics
- CLI attached-mode tmux/Zellij adapters
- web and macOS native agent grids

## Related

[[pibarm runtime design]] · [[runtime core and protocol]] · [[parity matrix]] · [[web client]] · [[macos app]]
