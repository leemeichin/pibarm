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
│   └── pi driver          pinned AgentSessionRuntime adapter (D4)
├── multiplexer            agent children of sessions ([[sessions and multiplexing]])
├── worktree service       create/diff/remove, path policy (.pi/wt/<name>)
├── watcher service        host-side watchers, durable event queue
├── forge service          adapter registry + cache ([[forge integration]])
├── notify service         fan-out to clients + platform notifiers
├── obsidian exporter      unchanged lib/obsidian-export.ts, fed from journals
└── gateway                unix socket + WS listener, auth, capability handshake
```

Existing extensions are the behavioural spec: `plan-worktree.ts`, `watch-agent.ts`, `agent-runner.ts`, `forge.ts` et al are refactored so their logic lives in host services and their pi-extension form becomes a thin binding. That refactor is the riskiest part of M1 after the pi spike; the mitigation is doing it one extension at a time with the CLI as the regression harness.

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

The journal is what capture, reattach, `/agents`, Obsidian export, and the web transcript all read. No second source of truth.

## ACP boundary (D2)

ACP v1 is the canonical client model. The host implements standard ACP methods where the semantics match and uses underscore-prefixed extension methods for pibarm runtime services. It never adds custom root fields to ACP types; versioned pibarm data lives under `_meta.pibarm`.

| Capability                       | ACP surface                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| initialize and negotiate         | `initialize`; standard capabilities plus `agentCapabilities._meta.pibarm`               |
| discover/create/resume a session | `session/list`, `session/new`, `session/load`                                           |
| prompt, stream, cancel           | `session/prompt`, `session/update`, `session/cancel`                                    |
| tool progress and permission     | ACP tool-call updates and `session/request_permission`                                  |
| plan projection                  | ACP `plan` session updates; validation, revisions, and approval state in `_meta.pibarm` |
| precise replay after a cursor    | `_pibarm/journal/read`                                                                  |
| approve/refine/execute a plan    | `_pibarm/plan/approve`, `_pibarm/plan/refine`, `_pibarm/plan/execute`                   |
| rich planning questions          | `_pibarm/question/create`; map to standard elicitation when that RFD is ratified        |
| child agents and worktrees       | `_pibarm/agent/*`, `_pibarm/worktree/*`                                                 |
| watchers, forge, tasks, settings | `_pibarm/watcher/*`, `_pibarm/forge/*`, `_pibarm/task/*`, `_pibarm/settings/*`          |

Generic ACP clients can create/load sessions, prompt, stream tool and plan updates, cancel, and answer standard permission requests. First-party clients inspect `_meta.pibarm` before showing extension UI. Unknown `_pibarm/*` notifications are ignored and unknown requests receive normal JSON-RPC method-not-found responses.

ACP's structured elicitation and remote Streamable HTTP/WebSocket work are still RFDs. Until they land, pibarm keeps its richer question schema namespaced and treats WebSocket as a documented custom ACP transport, not as standard ACP.

### Transports

- **Standard interoperability:** `pibarm acp` is a newline-delimited stdio adapter. An editor launches it as an ACP agent; it connects to or starts the local host.
- **Local first-party clients:** unix socket with the same JSON-RPC messages and lifecycle.
- **Browser/native remote clients:** one same-origin WebSocket carrying ACP JSON-RPC messages. Revisit only the transport adapter when ACP's remote transport is ratified.

ACP v1 transport does not provide missed-event replay. `session/load` supplies the standard conversation replay; `_pibarm/journal/read` adds exact sequence cursors for first-party reconnect and operational events. The journal remains authoritative rather than relying on connection affinity or in-flight delivery.

Auth is outside ACP message semantics: a host bearer credential is minted on first run and stored `0600`; unix-socket clients rely on filesystem permissions. Browser and remote handling is defined in [[security, permissions and notifications]].

## Pi SDK adapter (D4) — the M1 spike

The host pins the Pi release used in development and creates one `AgentSessionRuntime`-backed driver per session. The adapter maps Pi lifecycle and message/tool events to journal entries and ACP updates; host policy intercepts tool calls before execution. Pi's runtime owns model/provider setup, resource loading, context compaction, cancellation, and session replacement rather than pibarm reproducing them.

The spike validates the documented SDK path, not a choice between SDK and terminal scraping. Exit criteria:

- stream assistant, thinking, tool-call, tool-result, usage, and lifecycle events without parsing terminal text
- intercept and reject a tool call before execution for plan/permission policy
- switch mode/model/preset and cancel a turn cleanly
- complete plan → rich elicit → approve → worktree execute with no TUI attached
- expose the same session through the stdio ACP adapter and the first-party WebSocket adapter
- restart/reload without losing the journal cursor or pending question state

A missing SDK hook is recorded as a pinned compatibility gap and upstreamed or handled in the thin adapter. Pty parsing is not a fallback: it would create a second lossy state model and fail the safety/replay requirements.

## CLI dual-mode

The pibarm CLI experience keeps two paths (PRD open question resolved as recommended):

1. **Standalone** (today's behaviour): extensions in-process with pi. Nothing changes for existing users.
2. **Attached**: `pibarm attach [session]` — a TUI ACP client of the host. Agent rendering in this mode may target tmux panes (D5): the CLI renderer subscribes to `_pibarm/agent/*` events and maps them onto panes as `agent-runner.ts` does today.

Shared behaviour lives in `lib/` so the two paths cannot drift; the standalone path is the regression baseline for the host refactor.

## Issue seeds (M1)

- Pi `AgentSessionRuntime` adapter spike against the exit criteria
- ACP stdio adapter and conformance fixtures for the standard session subset
- `pibarmd` skeleton: gateway, auth token, ACP initialization/capability handshake
- journal writer/reader + bounded-payload sidecars
- session manager: create/attach/input/detach/close
- extract plan/elicitation logic from `plan-worktree.ts` into host service + extension binding
- worktree service extraction
- `pibarm attach` minimal TUI client
- launchd/systemd unit templates + `bun run doctor` checks

## Related

[[pibarm runtime design]] · [[sessions and multiplexing]] · [[security, permissions and notifications]] · [[parity matrix]]
