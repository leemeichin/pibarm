---
title: roadmap and issue seeds
stage: design
status: draft
created: 2026-07-19
tags:
  - pibarm
  - runtime
  - design
  - roadmap
prev: "[[pibarm runtime design]]"
---

# roadmap and issue seeds

Stage 3 feedstock: the [[pibarm runtime PRD|PRD]] milestones crossed with the issue seeds each design note carries. When the doc settles and the M1 spike lands, these become GitHub issues (epics per milestone, one issue per seed, labels `runtime`, `web`, `macos`, `forge`, `security`).

**Not created yet — deliberately.** Stage 3 waits on: the PRD's open questions (chiefly the SourceHut assumption and D4's spike outcome), and a pass to size/split seeds into issue-shaped units.

## M1 — host ([[runtime core and protocol]])

Exit: a session runs plan → elicit → approve → worktree-execute entirely through the host with no TUI attached; CLI attaches and detaches without loss.

- pi driver spike (Plan A fidelity vs exit criteria) — **first, everything gates on it**
- `pibarmd` skeleton: gateway, token auth, capability handshake
- journal writer/reader + bounded sidecars
- session manager lifecycle
- plan/elicitation extraction from `plan-worktree.ts`
- worktree service extraction
- `pibarm attach` minimal TUI client
- launchd/systemd templates + doctor checks
- Linux host CI job (guardrail from [[windows and linux]])
- gateway auth hardening seeds from [[security, permissions and notifications]]

## M2 — web ([[web client]])

Exit: every P0 web row in the [[parity matrix]] works against a localhost host.

- static serving + browser auth handshake
- journal store (replay/tail/reconnect/blob expansion)
- session view: transcript, bounded tool rows, input, mode banner
- elicitation forms (all types)
- plan view + refinement diffs
- agent grid + pane policy UX ([[sessions and multiplexing]])
- task pills + StatusLine wiring
- worktree list + diff viewer
- command palette
- web notifications + badge fallback
- shell bridge feature-detection slot ([[windows and linux]] guardrail)

## M3 — macOS ([[macos app]])

Exit: P0 macOS parity rows; a question answered from a lock-screen notification.

- `PibarmKit` + schema-generated types
- app skeleton: connect/adopt host, session list, transcript
- elicitation sheets
- actionable notifications + dock badge
- agent grid + pop-out windows
- plan view
- menu bar extra
- worktree table + Finder reveal
- URI scheme + Obsidian deep links
- signing/notarisation/Sparkle pipeline

## M4 — forge depth ([[forge integration]])

Exit: full review (open → inline threads → submit) on GitHub **and** SourceHut without the forge's website; CI triage loop demonstrated.

- forge service extraction + adapter registry
- changes/threads/versions model + `forge_event` journaling
- GitHub adapter depth (threads, review submit, checks/logs)
- SourceHut adapter depth (patchset threading, quoted-email rendering, builds, todo)
- review inbox + notification wiring
- review workspace: web, then macOS native diff
- CI triage orchestration
- ticket-to-plan seeding
- keychain interface + backends (also serves [[security, permissions and notifications]])

## M5 — AGit and polish

Exit: publish-to-review against Codeberg (Forgejo) via AGit; preset UI; Obsidian deep links round-trip.

- AGit publish strategy in the git layer
- `generic-agit` adapter (publish + poll)
- Forgejo adapter for review depth
- preset picker surfaces (PRD F10)
- Obsidian note preview + `pibarm://` round-trip (PRD F9)
- notify policy UI (quiet hours, generic mode)
- Tauri shell spike ([[windows and linux]])

## Cutting rules

Inherited from the PRD: P0 rows in the [[parity matrix]] define each milestone's bar; P1/P2 items slip without renegotiation. If M1's spike forces Plan B (pty fallback), M2 scope is unchanged but streaming granularity degrades — note it in [[runtime core and protocol]] and move on.

## Related

[[pibarm runtime PRD]] · [[pibarm runtime design]] · [[parity matrix]]
