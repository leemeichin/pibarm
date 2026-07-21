---
title: web client
stage: design
status: draft
created: 2026-07-19
tags:
  - pibarm
  - runtime
  - design
  - web
hub: "[[pibarm runtime design]]"
---

# web client

The browser surface from [[pibarm runtime PRD]] F2, decisions D8 and D2 in [[pibarm runtime design]].

## Serving model (D8)

The host serves the web client itself: `pibarmd` bundles a static build and exposes it on its listener next to the WebSocket. Consequences, all good:

- No version skew — the client is built from the same commit as the host that serves it.
- No hosting, CORS, or version negotiation. The bearer credential is entered once and exchanged for a same-origin `HttpOnly`, `SameSite=Strict` browser session cookie; it is never placed in a URL or browser-readable storage.
- Remote use inherits the transport stance in [[security, permissions and notifications]]: SSH forwards preserve a localhost origin; Tailscale Serve provides HTTPS/WSS and proxies to the loopback host. The app needs no tunnel code.
- The existing Astro site at `site/` stays what it is: marketing/docs. It can link to `http://localhost:…` but the app does not live there.

## Issue #44 recommendation

GitHub issue #44 asks for a time-boxed remote-UI spike: start a run, stream output, view diffs, and approve/merge. The smallest useful vertical slice is:

1. choose a trusted repository and submit a prompt
2. stream one host-owned session and reconnect without losing output
3. show the resulting worktree diff
4. approve the result and hand off merge/PR creation through the existing forge path

Recommendation: build that slice as the first M1/M2 integration, using the local `pibarmd` + host-served SPA architecture. Do **not** use Cloudflare Worker/Pages as the agent host: it cannot safely own local repositories, Pi processes, worktrees, or CLI credentials. Existing site deployment work may publish docs, but remote coding reaches the user's host through SSH forwarding or Tailscale Serve. The spike is successful when the four-step flow works from a second device on the tailnet; it does not need the full dashboard, review inbox, or desktop shell.

## Stack

- React + **pibarm-ds** (`packages/pibarm-ds`) — the design system already ships the exact vocabulary this app needs: `StatusLine`, `TaskPill`, `Terminal`, `Badge` (including terminal-native variants), `Callout`, `CommandRow`, tokens, fonts, dark/light. Per `.design-sync/conventions.md`: tokens for layout glue, `pib-*` classes belong to components, no utility framework.
- Vite build, output embedded into the host package. No SSR — it is a socket-driven app.
- Protocol: generated ACP client types for standard session flow plus a small `_pibarm/*` extension module. WebSocket is a custom transport adapter until ACP standardizes remote transport.
- State: ACP `session/load` plus journal replay/live tail per attached session, kept in a normalized store (session → agents → events); `_pibarm/journal/read` resumes from the last `seq` cursor. The bounded-payload invariant keeps this cheap; blob expansion is fetch-on-demand.

## Information architecture

```text
┌ sidebar ────────┐ ┌ main ──────────────────────────────┐
│ sessions        │ │ transcript / agent grid / review    │
│  by repo        │ │                                     │
│ review inbox    │ │                                     │
│ watchers        │ ├─ task pills ───────────────────────┤
│ settings        │ ├─ StatusLine ───────────────────────┤
└─────────────────┘ └────────────────────────────────────┘
```

- **Session view**: transcript (assistant messages rendered as markdown; tool calls as compact bounded rows, expandable), input box, plan-mode banner when active. The Terminal component renders captured shell/agent output with the `.slash/.cmd/.dim/.ok/.warn/.err` idiom.
- **Agent grid**: the [[sessions and multiplexing]] renderer — visible agents as panes in a responsive grid (3-up desktop, stacked on narrow), overflow group as tabs; per-pane capture scrollback, join/kill controls; background agents live only in the pills.
- **Plan view**: ACP plan updates render as a checklist; `_meta.pibarm` adds validation, worktree recommendation, approval state, and refinement history. Approve/refine/execute buttons call `_pibarm/plan/*`.
- **Elicitation**: `_pibarm/question/create` requests render as real forms — every type from the [[parity matrix]] planning rows (free text, select one/many with option previews, confirm with action preview, boolean, number with min/max, per-question notes). Tool permissions use ACP `session/request_permission`. The namespaced form maps to standard ACP elicitation when its RFD lands.
- **Review workspace**: the [[forge integration]] surface — unified diff viewer (virtualised, word-diff), thread rail with version anchoring, agent findings as draft threads, submit control per forge capability.
- **Worktrees**: list with diff stat; full diff view reuses the review diff component minus threads.
- **Command palette**: every slash command and protocol verb, keyboard-first (`mod+k`), because the TUI sets the bar (PRD principle 2).

## Notifications and presence

- Web Notifications API for `question_open`, watcher events, and review-inbox deltas, with click-through deep links (`#/session/<id>/question/<qid>`). Permission requested on first waiting question, not on load.
- Falling back (permission denied / unsupported): title badge count + favicon dot.
- Presence: attached clients and input focus shown as small indicators near the input, per the last-writer-wins rule in [[runtime core and protocol]].

## Responsiveness and offline

- Usable at tablet width (PRD platform table): sidebar collapses, agent grid stacks, review workspace goes single-column with a thread drawer.
- Disconnect: banner + automatic reconnect with cursor resume; input disabled while detached. No offline queueing in v0 — honesty over cleverness.

## Issue seeds (M2)

- #44 thin slice: trusted repo picker, start run, stream/reconnect, worktree diff, approve + merge/PR handoff
- host static-serving + bearer-to-session-cookie auth handshake in the browser
- journal store: replay/tail/reconnect cursors, blob expansion
- session view: transcript renderer, bounded tool rows, input, mode banner
- elicitation form renderer for all question types
- plan view with refinement diffs
- agent grid renderer + pane policy UX
- task pills + StatusLine wiring from `_pibarm/task/*` and status events
- worktree list + diff viewer
- review inbox + review workspace (M4 dependency on forge service)
- command palette
- web notifications + badge fallback

## Related

[[pibarm runtime design]] · [[runtime core and protocol]] · [[sessions and multiplexing]] · [[forge integration]] · [[parity matrix]] · [[macos app]]
