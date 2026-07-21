---
title: runtime core and protocol
stage: design
status: draft
created: 2026-07-19
tags:
  - pibarm
  - runtime
  - design
hub: "[[pibarm runtime design]]"
---

# runtime core and protocol

Design for `pibarmd`, the host process from [[pibarm runtime design]] D1–D4. Serves PRD F1.

## Process model

`pibarmd` is a bun/TypeScript daemon started by the user (launchd agent on macOS, systemd user unit on Linux; also `pibarm host start` for foreground). One host per user per machine is the default; it manages sessions across many repos.

```text
pibarmd
├── session manager        one pi session per entry; owns lifecycle + journal
│   └── pi driver          embedded headless pi (D4)
├── multiplexer            agent children of sessions ([[sessions and multiplexing]])
├── worktree service       create/diff/remove, path policy (.pi/wt/<name>)
├── watcher service        host-side watchers, durable event queue
├── forge service          adapter registry + cache ([[forge integration]])
├── notify service         fan-out to clients + platform notifiers
├── obsidian exporter      unchanged lib/obsidian-export.ts, fed from journals
└── gateway                unix socket + WS listener, auth, capability handshake
```

Existing extensions are the behavioural spec: `plan-worktree.ts`, `watch-agent.ts`, `butty.ts`, `forge.ts` et al are refactored so their logic lives in host services and their pi-extension form becomes a thin binding. That refactor is the riskiest part of M1 after the pi spike; the mitigation is doing it one extension at a time with the CLI as the regression harness.

## Session lifecycle

- **Create**: client asks for a session in a repo (or repo-less). Host spawns a pi driver, opens a journal, registers with the session manager.
- **Attach**: any number of clients; each gets a replay cursor (journal offset) then live tail. Presence (who's attached, who has input focus) is a broadcast event.
- **Input**: serialized through the host; last-writer-wins with a visible focus indicator, per PRD F1.
- **Detach/crash**: session unaffected. Client reattach resumes from its cursor.
- **End**: explicit close or idle policy; journal retained; Obsidian export finalised.

## Event journal (D3)

Append-only JSONL per session under `~/.pi/pibarm/sessions/<id>/journal.jsonl`, mirroring pi's own session-file habits so tooling instincts transfer.

Event envelope:

```json
{
  "seq": 412,
  "ts": "2026-07-19T17:03:11Z",
  "kind": "tool_result",
  "agent": "root",
  "data": { "tool": "summarize_worktree_diff", "bounded": true, "rows": ["…"] }
}
```

Kinds (initial set): `session_meta`, `user_input`, `assistant_delta`, `assistant_message`, `tool_call`, `tool_result`, `question_open`, `question_answered`, `plan_captured`, `plan_state`, `mode_changed`, `agent_spawned`, `agent_state`, `watcher_event`, `forge_event`, `task_state`, `notice`. Payloads over a size threshold are stored as sidecar blobs and referenced, keeping the journal tailable (bounded-payload invariant).

The journal is what capture, reattach, `/butty-capture`, Obsidian export, and the web transcript all read. No second source of truth.

## Protocol (D2)

JSON-RPC 2.0. Transport: unix domain socket locally, WebSocket for anything else. Server→client events are JSON-RPC notifications on the same connection.

Method families (v0):

| Family       | Examples                                                                      |
| ------------ | ----------------------------------------------------------------------------- |
| `host.*`     | `hello` (auth + capability handshake), `status`, `settings.get/set`           |
| `session.*`  | `list`, `create`, `attach`, `input`, `interrupt`, `close`, `journal.read`     |
| `plan.*`     | `show`, `approve`, `refine`, `execute` (`target: active\|worktree`)           |
| `question.*` | `list`, `answer` — typed answers matching `elicit_plan_questions` schemas     |
| `agent.*`    | `spawn`, `list`, `capture`, `join`, `kill` ([[sessions and multiplexing]])    |
| `worktree.*` | `list`, `create`, `diff`, `remove`                                            |
| `watcher.*`  | `start`, `list`, `stop`, `events.read`                                        |
| `forge.*`    | `status`, `inbox`, `prs`, `ci`, `tickets`, `review.*` ([[forge integration]]) |
| `task.*`     | `list` — the task-widget model                                                |

Capability handshake at `host.hello` returns semver'd feature flags (`butty`, `watchers`, `forge.github`, `forge.sourcehut.reviews`, `agit`, …) — the mechanism behind the cross-cutting capability-negotiation invariant in [[pibarm runtime design]].

Auth: bearer token minted by the host on first run, stored `0600`; unix-socket clients may skip it (filesystem perms suffice). Remote stance in [[security, permissions and notifications]].

## pi embedding (D4) — the M1 spike

Requirements on the driver: streamed assistant/tool events, tool-call interception (for gates), mode control (plan mode's tool restrictions), model/preset switching, clean cancellation.

- **Plan A**: pi's programmatic/RPC mode, one pi process per session, events bridged into the journal.
- **Plan B (fallback)**: pty-wrap `pi -p`/interactive pi, drive via stdin, recover structure from pi's own session JSONL as a sidecar. Uglier, measurably lossy for streaming; acceptable only if Plan A has fidelity gaps.

Spike exit criteria: an end-to-end plan → elicit → approve → worktree-execute flow through the host with no TUI attached, gates enforced host-side. If Plan A fails any criterion, record why in this note and proceed with Plan B while upstreaming needs to pi.

## CLI dual-mode

The pibarm CLI experience keeps two paths (PRD open question resolved as recommended):

1. **Standalone** (today's behaviour): extensions in-process with pi. Nothing changes for existing users.
2. **Attached**: `pibarm attach [session]` — a TUI protocol client of the host. Butty rendering in this mode may still target WezTerm panes (D5): the CLI renderer subscribes to agent events and maps them onto panes exactly as `butty.ts` does today.

Shared behaviour lives in `lib/` so the two paths cannot drift; the standalone path is the regression baseline for the host refactor.

## Issue seeds (M1)

- pi driver spike: Plan A fidelity assessment against the exit criteria
- `pibarmd` skeleton: gateway, auth token, capability handshake
- journal writer/reader + bounded-payload sidecars
- session manager: create/attach/input/detach/close
- extract plan/elicitation logic from `plan-worktree.ts` into host service + extension binding
- worktree service extraction
- `pibarm attach` minimal TUI client
- launchd/systemd unit templates + `bun run doctor` checks

## Related

[[pibarm runtime design]] · [[sessions and multiplexing]] · [[security, permissions and notifications]] · [[parity matrix]]
