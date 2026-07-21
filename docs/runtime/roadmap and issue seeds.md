---
title: roadmap and issue seeds
stage: design
status: issues-cut
created: 2026-07-19
tags:
  - pibarm
  - runtime
  - design
  - roadmap
prev: "[[pibarm runtime design]]"
---

# roadmap and issue seeds

Stage 3 feedstock: the [[pibarm runtime PRD|PRD]] milestones crossed with the issue seeds each design note carries.

**Stage 3 is cut.** The seeds below now exist as GitHub issues: one epic per milestone with the seeds attached as sub-issues (labels were skipped — the repo has none; titles carry an `M<n>:` prefix instead). The epics:

| Milestone            | Epic                                                  | Sub-issues |
| -------------------- | ----------------------------------------------------- | ---------- |
| M1 — host            | [#51](https://github.com/leemeichin/pibarm/issues/51) | #56–#66    |
| M2 — web             | [#52](https://github.com/leemeichin/pibarm/issues/52) | #67–#77    |
| M3 — macOS           | [#53](https://github.com/leemeichin/pibarm/issues/53) | #78–#87    |
| M4 — forge depth     | [#54](https://github.com/leemeichin/pibarm/issues/54) | #88–#96    |
| M5 — AGit and polish | [#55](https://github.com/leemeichin/pibarm/issues/55) | #97–#103   |

The SourceHut reading of the PRD's open question is baked into the M4 epic (flagged there too); the pi driver spike (#56) still gates the rest of M1. The earlier web UI spike issue #44 is superseded by the M2 epic, and the permission-gate issue #1 is referenced from #65.

## Foundation checkpoint (before M1)

- reproducible prompt/tool baseline and pinned/latest Pi compatibility checks
- retirement of the separate pane API and terminal-emulator coupling
- additive deferred tool loading and strict plan-mode policy
- progressive Python, Ruby/Rails, and TypeScript/React/Vue/Vite skills
- first post-checkpoint efficacy issue: `code_intel` from [[language intelligence]] with trusted installed servers, lazy lifecycle, and bounded fallback

## M1 — host ([[runtime core and protocol]])

Exit: a session runs plan → elicit → approve → worktree-execute entirely through the host with no TUI attached; CLI attaches and detaches without loss.

- Pi `AgentSessionRuntime` adapter spike against the documented SDK exit criteria — **first, everything gates on it**
- ACP stdio adapter + conformance fixtures for the supported standard subset
- `pibarmd` skeleton: gateway, token auth, ACP initialization + `_meta.pibarm` capability handshake
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

- #44 thin vertical slice: trusted repo, start run, stream/reconnect, worktree diff, approve + merge/PR handoff
- static serving + bearer-to-session-cookie browser auth handshake
- custom ACP WebSocket adapter behind the standard-independent transport interface
- journal store (ACP load + exact replay/tail/reconnect/blob expansion)
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

Inherited from the PRD: P0 rows in the [[parity matrix]] define each milestone's bar; P1/P2 items slip without renegotiation. M1 does not fall back to terminal scraping: an SDK fidelity gap is fixed in the thin adapter or upstream before the runtime safety/replay contract is declared complete.

## Related

[[pibarm runtime PRD]] · [[pibarm runtime design]] · [[parity matrix]]
