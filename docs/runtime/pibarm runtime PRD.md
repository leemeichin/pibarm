---
title: pibarm runtime PRD
stage: prd
status: draft
owner: pibarm maintainers
created: 2026-07-19
tags:
  - pibarm
  - runtime
  - prd
next: "[[pibarm runtime design]]"
---

# pibarm runtime PRD

> Stage 1 of 3: **PRD** → [[pibarm runtime design|design doc]] → GitHub issues ([[roadmap and issue seeds|seeds]]).

## Summary

pibarm today is a set of pi extensions and skills that make agent work safer and more legible in a terminal: plan first, execute in worktrees, multiplex visible agents through tmux, watch PRs in the background, and keep a durable Obsidian record. Its visible agent panes are terminal-independent, but the overall product still assumes a TTY and local shell.

This PRD proposes the **pibarm runtime**: the same agent runtime environment lifted out of the CLI behind an ACP-compatible client boundary so it can be driven from a **web client** and a **native desktop app** (macOS first), with native UX affordances instead of terminal emulation. Everything the TUI can do — multiplexing, planning, elicitation, worktrees, watchers, presets, subagents, forge operations — must be doable from web and desktop, and each surface should do it in the way that surface does best.

The second pillar is **deep forge integration**. Not GitHub alone: GitHub and SourceHut as first-class peers, with the AGit push protocol (Forgejo, Gitea, and anything else that speaks it) as a fast follow. Deep means the forge is a workspace, not a status line: review inboxes, inline review authoring, CI log triage, and tickets that feed straight into plan mode.

## Background

The full inventory of what exists today, and what each piece must become on web and desktop, lives in the [[parity matrix]]. The short version:

- **Planning**: `/plan`, plan mode restrictions, `elicit_plan_questions` with typed inputs, approve/refine loop.
- **Isolation**: repo-local git worktrees (`.pi/wt/<name>`), worktree agents, diff summaries.
- **Multiplexing**: standard child-agent tools with automatic tmux panes, capture/wait/kill lifecycle.
- **Background work**: watcher agents polling PR/CI state, waking the parent session on change.
- **Forge**: `forge_*` tools over `gh` (GitHub) and `hut` (SourceHut), repo statusline, `/review`.
- **Record**: Obsidian session export with a stable note-path scheme and autosync.
- **Configuration**: role presets (model/tools/thinking), mcporter MCP bridge, themes.

Most of these remain welded to a terminal. Agent panes now depend only on tmux rather than one emulator, but notifications still use terminal escape sequences and rich elicitation is a TUI form. The product is good; the delivery surface is singular.

## Problem statement

1. **The runtime is trapped in the TTY.** You cannot check a plan waiting for approval, answer an elicitation question, or review a worktree diff unless you are at the terminal that owns the session. Sessions die with the terminal window.
2. **Multiplexing is still borrowed, not owned.** tmux makes visible agents portable across terminals, but it still does not provide a real review surface, diff viewer, or form control.
3. **Forge work bounces between tools.** pibarm can list PRs and CI, but reviewing, replying, and triaging still means a browser tab per forge. Non-GitHub forges get shallower treatment than GitHub, and AGit-style forges get none.
4. **The record and the runtime are separate.** Obsidian holds the durable narrative, but you cannot act from it; the runtime holds the action, but its presentation is ephemeral.

## Goals

- G1 — **Runtime independence**: pibarm sessions run in a host process that outlives any client; CLI, web, and desktop are attachable views over the same session.
- G2 — **Full capability parity**: every capability in the [[parity matrix]] is reachable from web and desktop. Parity is behavioural, not cosmetic — same tools, same safety gates, same session semantics.
- G3 — **Native affordances, not terminal cosplay**: each surface renders agent work idiomatically — panes and forms and diff viewers on desktop, responsive layout and web notifications on web, menu bar/dock/system notifications on macOS. See [[web client]] and [[macos app]].
- G4 — **Deep forge integration**: GitHub and SourceHut as equals behind one adapter interface, with review authoring, CI triage, and ticket-to-plan flows; AGit protocol support for Forgejo/Gitea-class forges. See [[forge integration]].
- G5 — **Local-first and credential-safe**: the runtime host runs on hardware the user controls; forge credentials live in OS keychains or existing CLI auth, never in repo config — same rule as today.
- G6 — **The CLI loses nothing**: existing TUI users see identical or better behaviour; extensions keep working.

## Non-goals

- **A hosted SaaS.** The web client connects to the user's own runtime host (localhost, LAN, or tailnet). No pibarm-operated multi-tenant service in this cycle.
- **A general-purpose terminal emulator or multiplexer.** Desktop and web render agent sessions natively; they do not aim to replace tmux or terminal applications for general shell use. An embedded terminal view exists only where a task needs one (inline shell, interactive REPLs).
- **Mobile clients.** The protocol should not preclude them; nothing in this cycle builds them.
- **Replacing pi.** pibarm remains a layer over pi. The runtime host embeds and orchestrates pi sessions; it does not fork the agent core.
- **Forge hosting features** (repo browsing, wikis, releases). Deep integration targets the _work loop_: changes, reviews, CI, tickets.

## Users and jobs

| User                              | Job to be done                                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| The existing pibarm terminal user | Step away from the terminal without abandoning sessions; answer plan questions and approve work from wherever they are.                               |
| The multi-agent operator          | Run 3–10 concurrent agents across repos and actually see them — status, output, blockers — without a pane-management tax.                             |
| The reviewer                      | Treat incoming PRs/patches across GitHub and SourceHut as one inbox; review with agent assistance; post inline findings without a browser round-trip. |
| The non-GitHub developer          | Get the same depth of integration on SourceHut or a Forgejo instance as GitHub users get everywhere else.                                             |

## Product principles

1. **One runtime, many views.** A session has no home surface. Detach from the CLI, pick up on the phone-sized web view, finish on the Mac.
2. **Keyboard-grade everywhere.** The TUI sets the bar: every action reachable without a pointer; a command palette on every surface mirroring the slash commands.
3. **Safety travels with the session.** Plan-mode restrictions, permission gates, and worktree isolation are runtime-enforced, so no client can accidentally offer a weaker sandbox.
4. **The forge is a first-class workspace.** Forge state is data in the runtime, not text in a status line.
5. **Standard core, boring extensions.** ACP JSON-RPC for agent sessions, `_pibarm/*` for runtime-specific capabilities, and event-sourced journals for replay. WebSocket remains a documented custom transport until ACP standardizes remote transport.

## Feature requirements

Priorities: **P0** ships in the first usable release of a surface; **P1** fast follow; **P2** nice to have.

### F1 — Runtime host (P0)

A long-lived host process (`pibarmd`) that owns sessions, agents, watchers, and forge state, exposing the [[runtime core and protocol|runtime protocol]] to clients.

- Sessions survive client disconnects; reattach shows full scrollback and pending questions.
- Multiple simultaneous clients per session (read-write with last-writer-wins on input focus; presence indicators).
- Hosts are loopback-only by default; remote attach uses SSH forwarding or Tailscale Serve as a user-owned HTTPS/WSS proxy, without pibarm-operated tunnels or PKI.
- The existing CLI becomes the first protocol client (or wraps it) so behaviour cannot fork.

### F2 — Web client (P0)

Browser app served by the runtime host itself. GitHub issue #44's start → stream → diff → approve/merge flow is the first vertical slice; it runs against the user's host rather than a Cloudflare Worker. Details in [[web client]].

- Session list, live transcript, input, tool-call rendering with bounded payloads (same discipline as the Obsidian exporter).
- Plan mode: visible mode state, plan document view, approve / refine / execute-in-worktree actions.
- Elicitation forms: every `elicit_plan_questions` type (free text, select one/many, confirm, boolean, number, notes, previews) as real form controls.
- Task widget parity: pills for todos, subagents, worktree agents, and watchers.
- Web notifications for waiting questions and watcher events.
- Built on `packages/pibarm-ds` — the design system already renders StatusLine, TaskPill, Terminal, Callout et al.

### F3 — macOS app (P0 for the desktop track)

Native macOS application. Details in [[macos app]].

- True native shell: menu bar, dock badge with waiting-question count, system notifications with reply/approve actions, multi-window, full keyboard control.
- Agent grid: child agents as a native pane grid — resizable, focusable, detachable to windows — replacing tmux on this surface.
- Native diff review for worktrees and incoming PRs/patches.
- Menu bar extra: at-a-glance runtime state (sessions running, questions waiting, CI status) without the main window.

### F4 — Multiplexing without a terminal emulator (P0)

The shared child-agent runner generalises into runtime children, and each surface renders them its own way. Details in [[sessions and multiplexing]].

- Same lifecycle verbs as today: spawn, attach, capture, join, kill; same roles (scout/planner/worker); same worktree option.
- tmux rendering remains for the CLI; web/desktop render runtime-native panes.
- The three-agent row and fourth-agent confirmation become policy in the runtime, uniformly enforced.

### F5 — Planning and review UX (P0)

- Plan documents are structured artifacts (not just transcript text): steps, validation, worktree recommendation — renderable, checkable, diffable across refinements.
- Approve/refine/execute available from any attached client and from notification actions.
- `/review` becomes a review workspace on web/desktop: diff, agent findings, inline comment authoring, submit to forge.

### F6 — Worktrees (P0)

- Visual worktree list with status/diff stat; full diff viewer on web/desktop.
- One-tap flows for the existing verbs: create, diff, remove; merge/PR handoff via forge integration.

### F7 — Watchers and notifications (P0)

- Watchers run in the host, not as terminal siblings; events queue durably and fan out to every attached client plus the platform notification system.
- Notification actions where the platform allows: approve plan, open session, mute watcher.
- Cooldown/quiet-hours settings; parity with `PI_NOTIFY_*` envs.

### F8 — Deep forge integration (P0 GitHub + SourceHut; P1 AGit)

Details and adapter contract in [[forge integration]].

- One `ForgeAdapter` interface with capability flags; GitHub and SourceHut implement it fully, including the bits that differ (PRs vs email patchsets, checks vs builds.sr.ht, issues vs todo.sr.ht).
- Review inbox across configured forges: things awaiting my review, my PRs/patches and their state, failing CI.
- Inline review authoring from web/desktop, posted via the adapter (GitHub inline comments; SourceHut email replies via lists.sr.ht).
- CI triage: fetch logs, hand to an agent, propose fix, execute in worktree — the `/skill:ci-triage` loop with a UI.
- Ticket-to-plan: pick a ticket from `forge_tickets`, start `/plan` seeded with it.
- **AGit (P1)**: push-to-review via `git push -o topic=… -o title=…` refs/for flows for Forgejo/Gitea-class forges, plus their API for the review side. Capability-flagged so unsupported forges degrade gracefully.
- CLI auth (`gh`, `hut`) remains the default credential source where present; web/desktop hosts without those CLIs use per-forge tokens in the OS keychain. Never in repo config.

### F9 — Obsidian continuity (P1)

- Export continues to work identically when sessions run in the host.
- Web/desktop can render the exported note in-app and deep-link vault notes back to live sessions (URI scheme).

### F10 — Presets, subagents, MCP (P1)

- Preset switching (planner/executor et al) from a surface-native picker.
- `run_subagent(s)` and worktree agents already share one task/pane model.
- mcporter bridge unchanged in the host; discovery UI on web/desktop is P2.

### F11 — Windows and Linux desktop (P2, design now)

No native app this cycle, but the architecture must not be macOS-shaped. Decision and approach in [[windows and linux]].

### F12 — Language intelligence (P1)

One bounded code-intelligence tool uses trusted, already-installed language servers for definitions, references, symbols, hover, and diagnostics. Servers start lazily, never auto-install, and fall back to grep/read when unavailable. Details in [[language intelligence]].

## Platform requirements

| Surface      | Baseline                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Runtime host | macOS and Linux, bun runtime, no root, no always-on network exposure by default                                                 |
| Web client   | Evergreen Chromium/Firefox/Safari; usable at tablet width; no build-time coupling to host version (host serves matching client) |
| macOS app    | macOS 14+, Apple silicon first, notarised, Sparkle or MAS-out-of-scope decision recorded in [[macos app]]                       |
| CLI          | Unchanged pi + pibarm package; host-attach optional, never required                                                             |

## Success metrics

- A session started in the CLI can be answered, approved, and completed entirely from web and from macOS — demonstrated across all P0 features (parity checklist in [[parity matrix]] is the acceptance artifact).
- Zero tmux dependency for multiplexing on web/desktop; CLI automatic-pane behavior unchanged.
- A full review (open → inline comments → submit) completed against GitHub _and_ SourceHut without opening the forge's website.
- Median time-to-answer for a waiting elicitation question drops from "whenever I next look at the terminal" to under a minute via notification actions (instrument locally; no telemetry leaves the machine — measurement is a local stat, opt-in).
- Existing extension test suite passes against the host-embedded session path.
- GitHub issue #44's minimal flow completes from a second browser device over Tailscale Serve: start, reconnect to streamed output, inspect the worktree diff, approve, and hand off merge/PR creation.

## Milestones

1. **M1 — host**: `pibarmd`, protocol v0, CLI attaches, sessions survive detach. ([[runtime core and protocol]])
2. **M2 — web**: P0 web client against localhost host. ([[web client]])
3. **M3 — macOS**: native app, agent grid, notifications, menu bar extra. ([[macos app]])
4. **M4 — forge depth**: review inbox + inline authoring on GitHub and SourceHut; CI triage UI. ([[forge integration]])
5. **M5 — AGit + polish**: AGit adapter, Obsidian deep links, preset UI, Windows/Linux groundwork per [[windows and linux]].

Stage 3 (GitHub issues) will be cut from [[roadmap and issue seeds]] once the design doc settles.

## Risks

- **Pi SDK compatibility.** The design uses the documented, pinned `AgentSessionRuntime` surface, but lifecycle APIs can evolve. Mitigation: a thin adapter, exact development/CI pin, weekly latest-Pi compatibility run, and no pty fallback that would weaken event or gate fidelity.
- **Two rendering stacks (native macOS + web)** risk drift. Mitigation: parity is enforced at the protocol layer (capabilities are runtime features, clients only render), plus the [[parity matrix]] as a living acceptance sheet.
- **SourceHut's email-driven review** does not map 1:1 onto a PR-shaped UI. Mitigation: the adapter models _review threads_ generically; the design doc treats patchsets as first-class rather than fake PRs.
- **Security surface grows** the moment a host accepts non-local clients. Mitigation: [[security, permissions and notifications]] — token-gated host, localhost-only default, user-owned transport (SSH/tailnet) rather than pibarm-managed TLS.
- **Scope gravity.** Web + native + three forges is a lot. The P0/P1/P2 split above is the contract; anything not marked P0 is cuttable from a milestone without renegotiating the PRD.

## Open questions

- [ ] **"SourceForge" vs SourceHut.** The request said SourceForge; pibarm already integrates SourceHut (`hut`, builds.sr.ht) and every existing forge tool assumes it. This PRD assumes **SourceHut** was meant. If SourceForge (the classic forge) is genuinely intended, it becomes a new adapter with a much thinner API surface — flag before M4.
- [ ] ACP remote transport: when the Streamable HTTP/WebSocket RFD is ratified, does its lifecycle fully replace the custom WebSocket adapter or only its framing?
- [ ] macOS distribution: direct download + Sparkle vs App Store. Leaning direct; recorded in [[macos app]].
- [ ] AGit servers to certify against: Forgejo (Codeberg) first? Gitea cloud? Both claim protocol compatibility but diverge in API.

## Related

- [[pibarm runtime design]] — stage 2, the how
- [[parity matrix]] — capability inventory and acceptance sheet
- [[roadmap and issue seeds]] — stage 3 feedstock
