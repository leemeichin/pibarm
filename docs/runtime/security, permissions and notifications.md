---
title: security, permissions and notifications
stage: design
status: draft
created: 2026-07-19
tags:
  - pibarm
  - runtime
  - design
  - security
hub: "[[pibarm runtime design]]"
---

# security, permissions and notifications

Cross-cutting policy for the runtime ([[pibarm runtime design]] D10 and the safety invariant; PRD G5, F7). The existing rules — no tokens in repo config, CLI auth preferred, `SECURITY.md`'s cautions about MCP configs — all carry forward; this note covers what the host and new surfaces add.

## Threat model, briefly

New exposure relative to the TUI: (1) a network listener where there was none, (2) credentials usable by a long-lived daemon rather than an interactive CLI, (3) multiple clients able to drive a session that executes shell commands, (4) notification payloads leaving the terminal for OS/browser surfaces. Out of scope: multi-tenant isolation (single-user tool by declaration, PRD non-goals), forge-side compromise.

## Host access (D10)

- **Default bind: localhost + unix socket only.** The unix socket relies on filesystem permissions; the TCP listener requires the bearer token minted at first run (`~/.pi/pibarm/host-token`, `0600`), presented in `host.hello`.
- **Remote attach is user-transported**: SSH port-forward or tailnet address. pibarm ships no tunnel, no TLS provisioning, no PKI — documented recipes instead (doctor check: warn loudly if the listener is bound to a non-loopback, non-tailnet interface).
- Token rotation via `pibarm host rotate-token`; attached clients re-handshake.
- The web client is served from the same origin as the socket, so browser exposure equals listener exposure; no third-party origins are ever in play (D8).

## Sessions execute code; gates are host policy

The safety invariant from the hub note, concretely:

- **Plan mode**: tool restrictions (no edit/write, read-only-ish bash) enforced by the host's tool-interception layer in the pi driver, not by client UI state.
- **Permission gate**: `permission-gate.ts`'s intent (confirm risky/out-of-project actions) is redesigned as a host policy hook on `tool_call` events — the gate can raise a `question_open` that any attached client (or an actionable notification) answers. Its current off-by-default status carries over until the heuristic is better; the plumbing ships anyway because watchers and multi-client answering need it.
- **Worktree isolation** paths (`.pi/wt/`) are validated host-side; `worktree.remove` outside that root is refused regardless of client.
- **Agent toolsets by role** (scout/planner read-focused) are applied at spawn by the host ([[sessions and multiplexing]]).
- **Multi-client writes**: input focus is advisory, but _destructive verbs_ (plan approve, worktree remove, agent kill, review submit) are logged to the journal with the client identity that issued them, so "who approved this" always has an answer.

## Credentials

- Order per [[forge integration]]: CLI auth (`gh`/`hut`) → OS keychain token (Keychain / libsecret / Credential Manager behind one interface, per [[windows and linux]] guardrail 3) → none.
- The journal and wire events never contain credentials; forge calls are logged as metadata (adapter, verb, target). Bounded-payload sidecars are covered by the same rule.
- mcporter caution from `SECURITY.md` stands: MCP transport configs may embed secrets; the host redacts known-shape env/args when journaling `mcporter_*` calls.
- The host token grants everything; scoping (read-only clients) is deliberately deferred — recorded as a non-goal for v0 to avoid inventing an authz system for a single-user tool.

## Notifications

One host-side notify service ([[runtime core and protocol]]) fans out to:

| Channel               | Mechanism                                                            | Actions                             |
| --------------------- | -------------------------------------------------------------------- | ----------------------------------- |
| CLI                   | today's `waiting-notify.ts` escapes (Kitty/iTerm2/terminal-notifier) | none (as today)                     |
| Web                   | Web Notifications, badge fallback ([[web client]])                   | click-through deep link             |
| macOS                 | UNUserNotificationCenter ([[macos app]])                             | approve/decline, inline reply, open |
| Windows/Linux (later) | toast/XDG ([[windows and linux]])                                    | per-platform                        |

Policy lives host-side so every channel agrees: event classes (waiting question, watcher event, review-inbox delta, usage limit), per-class enable, cooldown (successor of `PI_NOTIFY_COOLDOWN_SECONDS`), quiet hours, and **payload privacy** — a "generic mode" that omits question/repo content from notification text (successor of `PI_NOTIFY_INCLUDE_QUESTION`, default off for lock-screen-visible channels).

Actionable answers (approve from a notification) traverse the same `question.answer` path with the client identity of the platform notifier — no side door.

## Issue seeds

- gateway auth: token mint/rotate/handshake; non-loopback bind warning in doctor
- tool-interception gate layer in the pi driver (plan mode + permission-gate hook)
- destructive-verb audit events with client identity
- keychain interface + three backends
- journal redaction for mcporter/env-shaped payloads
- notify service: event classes, cooldowns, quiet hours, generic mode
- security section for README/SECURITY.md covering the host

## Related

[[pibarm runtime design]] · [[runtime core and protocol]] · [[forge integration]] · [[web client]] · [[macos app]] · [[windows and linux]]
