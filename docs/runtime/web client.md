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
- No hosting, no CORS, no cookie-domain thinking; auth is the host bearer token, entered once and kept in `localStorage` scoped to that host origin.
- Remote use inherits the transport stance in [[security, permissions and notifications]] (SSH forward or tailnet URL) — the client needs zero awareness of it.
- The existing Astro site at `site/` stays what it is: marketing/docs. It can link to `http://localhost:…` but the app does not live there.

## Stack

- React + **pibarm-ds** (`packages/pibarm-ds`) — the design system already ships the exact vocabulary this app needs: `StatusLine`, `TaskPill`, `Terminal`, `Badge` (including terminal-native variants), `Callout`, `CommandRow`, tokens, fonts, dark/light. Per `.design-sync/conventions.md`: tokens for layout glue, `pib-*` classes belong to components, no utility framework.
- Vite build, output embedded into the host package. No SSR — it is a socket-driven app.
- State: journal replay + live tail per attached session, kept in a normalized store (session → agents → events); reconnect resumes from the last `seq` cursor. The bounded-payload invariant keeps this cheap; blob expansion is fetch-on-demand.

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
- **Plan view**: structured plan artifact — steps as a checklist, validation section, worktree recommendation, refinement history as diffs; approve / refine (with feedback box) / execute active / execute worktree buttons mapping to `plan.*`.
- **Elicitation**: `question_open` events render as real forms — every type from the [[parity matrix]] planning rows (free text, select one/many with option previews, confirm with action preview, boolean, number with min/max, per-question notes). Tabbed for multi-question batches, mirroring the TUI. Blocking questions pin above the input.
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

- host static-serving + auth handshake in the browser
- journal store: replay/tail/reconnect cursors, blob expansion
- session view: transcript renderer, bounded tool rows, input, mode banner
- elicitation form renderer for all question types
- plan view with refinement diffs
- agent grid renderer + pane policy UX
- task pills + StatusLine wiring from `task.*`/status events
- worktree list + diff viewer
- review inbox + review workspace (M4 dependency on forge service)
- command palette
- web notifications + badge fallback

## Related

[[pibarm runtime design]] · [[runtime core and protocol]] · [[sessions and multiplexing]] · [[forge integration]] · [[parity matrix]] · [[macos app]]
