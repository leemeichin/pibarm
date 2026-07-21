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

- **Default bind: loopback + unix socket only.** The unix socket relies on filesystem permissions. TCP/native clients authenticate with a bearer credential minted at first run (`~/.pi/pibarm/host-token`, `0600`) before ACP initialization.
- **SSH recipe:** forward the loopback listener to the client machine. The browser still sees localhost; pibarm adds no public listener.
- **Tailscale recipe (recommended for browser access):** keep `pibarmd` on loopback and use Tailscale Serve to proxy an HTTPS/WSS MagicDNS origin to it. Tailnet policy controls reachability; the host credential remains required as defense in depth. pibarm does not invoke Tailscale, provision certificates, or trust identity headers.
- Direct non-loopback binding is an explicit escape hatch, never the documented default. Doctor warns on any such bind, including a raw tailnet address, because browser notifications and credentials need a secure origin.
- Token rotation via `pibarm host rotate-token` invalidates attached native clients and browser sessions.

The host-served web app exchanges the bearer once for a short-lived, same-origin `HttpOnly`, `SameSite=Strict` session cookie. The bearer never appears in a URL, WebSocket subprotocol, `localStorage`, logs, or the journal. WebSocket upgrades require that cookie plus an allowed `Origin`; state-changing HTTP endpoints require the same origin. Native clients store host credentials in the platform keychain.

## Sessions execute code; gates are host policy

The safety invariant from the hub note, concretely:

- **Plan mode**: only inspection/question tools are active; every other tool call is rejected, and bash uses the same strict allowlist as the extension. The host's Pi tool-interception layer enforces this, not client UI state.
- **Permission gate**: `permission-gate.ts`'s intent (confirm risky/out-of-project actions) is redesigned as a host policy hook on `tool_call` events — the gate can raise a `question_open` that any attached client (or an actionable notification) answers. Its current off-by-default status carries over until the heuristic is better; the plumbing ships anyway because watchers and multi-client answering need it.
- **Worktree isolation** paths (`.pi/wt/`) are validated host-side; `_pibarm/worktree/remove` outside that root is refused regardless of client.
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

Actionable answers resolve the same ACP permission request or `_pibarm/question/create` request with the platform notifier's client identity — no side door.

## Issue seeds

- gateway auth: token mint/rotate, browser session-cookie exchange, origin checks, non-loopback bind warning
- documented SSH forwarding and Tailscale Serve recipes + doctor diagnostics
- tool-interception gate layer in the pi driver (plan mode + permission-gate hook)
- destructive-verb audit events with client identity
- keychain interface + three backends
- journal redaction for mcporter/env-shaped payloads
- notify service: event classes, cooldowns, quiet hours, generic mode
- security section for README/SECURITY.md covering the host

## Related

[[pibarm runtime design]] · [[runtime core and protocol]] · [[forge integration]] · [[web client]] · [[macos app]] · [[windows and linux]]
