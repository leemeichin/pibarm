---
title: parity matrix
stage: prd
status: draft
created: 2026-07-19
tags:
  - pibarm
  - runtime
  - prd
  - reference
---

# parity matrix

The capability inventory behind [[pibarm runtime PRD|the PRD]]'s G2. Every row is a thing the TUI does today; the columns say what it becomes on each surface. This doubles as the acceptance sheet: a surface reaches parity when every P0 row has a working, tested affordance.

Legend: **native** = purpose-built UI on that surface; **form** = rendered as structured form/controls; **auto** = handled by the runtime, surfaced passively; — = intentionally absent (with reason).

## Planning

| Capability (today) | Runtime host | Web | macOS | Priority |
| --- | --- | --- | --- | --- |
| `/plan`, plan-mode toggle, read-only enforcement | mode is session state, enforced host-side | mode banner + toggle; disabled inputs greyed | same, plus menu item and shortcut | P0 |
| `elicit_plan_questions` typed TUI form | questions are protocol objects | full form controls per type, tabbed, notes field | native sheets/popovers, notification quick-reply for confirm-type | P0 |
| `question` single prompt | protocol object | inline form in transcript | inline + notification action | P0 |
| `/plan-show`, captured plan + parsed steps | plan is a structured artifact | plan document view, step checklist, refinement diff | native document view, printable | P0 |
| `/approve-plan`, `/refine-plan`, execute active/worktree | verbs in protocol | buttons on plan view + command palette | same + notification actions | P0 |

## Isolation and worktrees

| Capability (today) | Runtime host | Web | macOS | Priority |
| --- | --- | --- | --- | --- |
| `create_git_worktree`, `.pi/wt/<name>` layout | unchanged, host executes | worktree list panel | same, Finder reveal | P0 |
| `/worktrees`, `/worktree-diff`, `summarize_worktree_diff` | diff computed host-side | diff stat + full diff viewer | native diff viewer (side-by-side) | P0 |
| `/worktree-remove [--force]` | confirmation gate host-side | confirm dialog with diff recap | same | P0 |
| `run_worktree_agent` | agent = runtime child | appears in agent grid + task pills | native pane in agent grid | P0 |

## Multiplexing (Matrix) — see [[sessions and multiplexing]]

| Capability (today) | Runtime host | Web | macOS | Priority |
| --- | --- | --- | --- | --- |
| `/matrix <task>` scout/planner bootstrap | orchestration in host | agent grid view | native pane grid | P0 |
| `matrix_spawn` roles, worktree option | runtime children with role toolsets | spawn dialog | spawn sheet + palette | P0 |
| `/matrix-attach` focus | client-side focus | click/keys | keys, window per agent optional | P0 |
| `matrix_capture` recent output | journal read | scrollback per pane | same | P0 |
| `matrix_join` wait + collect + cleanup | host verb | join button, results fold into parent transcript | same | P0 |
| `/matrix-list`, `/matrix-kill`, `-orphans` | host registry (no pane scraping) | list + kill controls | same | P0 |
| 3-agent row, 4th-agent confirmation | policy in host config | enforced via same policy | enforced via same policy | P0 |
| WezTerm panes | CLI-only rendering path, kept | — (runtime panes instead) | — (native panes instead) | P0 |

## Background work and notifications

| Capability (today) | Runtime host | Web | macOS | Priority |
| --- | --- | --- | --- | --- |
| `watch_agent` start/list/stop, goal+loop | watchers are host services | watcher panel, event feed | same + menu bar extra | P0 |
| durable event queue waking parent | unchanged, host-owned | live via socket, replay on attach | same | P0 |
| `waiting-notify` terminal escapes | host emits notification events | Web Notifications API | UNUserNotificationCenter, actionable | P0 |
| notify cooldown envs | host settings | settings UI | settings UI + quiet hours | P1 |
| `usage-limit-status` | host emits status events | banner | menu bar badge | P1 |

## Forge — see [[forge integration]]

| Capability (today) | Runtime host | Web | macOS | Priority |
| --- | --- | --- | --- | --- |
| forge detection, `/forge` remembered choice | adapter registry per repo | repo settings | same | P0 |
| `/forge-prs`, `/forge-ci`, `/forge-tickets` | adapter calls, cached | review inbox, CI list, ticket list | native lists, menu bar counts | P0 |
| `repo_status` statusline | status event stream | StatusLine component (ds already has it) | native status bar | P0 |
| `/review` + inline GitHub findings | review session host-side | review workspace: diff + comments + submit | native review window | P0 |
| SourceHut patchset/email review | adapter models review threads | same workspace, thread-shaped | same | P0 |
| PR-open watcher auto-start | host policy | toggle in PR flow | same | P0 |
| AGit push-to-review | adapter + git push options | appears as normal "publish for review" | same | P1 |

## Agents, presets, MCP

| Capability (today) | Runtime host | Web | macOS | Priority |
| --- | --- | --- | --- | --- |
| `run_subagent`, `run_subagents`, timeouts | runtime children | task pills + expandable output | same | P0 |
| `/preset`, role presets | host applies to session | preset picker | same + menu | P1 |
| `mcporter_*` tools | unchanged in host | P2 discovery UI | P2 | P1/P2 |
| `todo_list` task widget pills | tasks are protocol objects | TaskPill components (ds has them) | native pills/sidebar | P0 |
| `/tasks` expanded view | — | panel | panel/window | P0 |

## Record and misc

| Capability (today) | Runtime host | Web | macOS | Priority |
| --- | --- | --- | --- | --- |
| Obsidian export + autosync, note-path scheme | exporter runs host-side, identical output | note preview, open-in-Obsidian link | same via `obsidian://` | P1 |
| `.pibarm-sessions.json` index | unchanged | auto | auto | P1 |
| inline shell `!cmd` | host executes, output captured | inline result block; embedded term only if interactive | same | P1 |
| themes (`pibarm-dark`/`-light`) | n/a | ds tokens, light/dark auto | native appearance-aware, same palette | P0 |
| statusline footer | event stream | StatusLine | status bar | P0 |
| `ar-kid` easter egg | unchanged | works for free | works for free | P0, obviously |

## Deliberate non-parity

- **General terminal emulation**: web/desktop embed a terminal view only for interactive child processes; they are not shells. Rationale in [[pibarm runtime PRD#Non-goals]].
- **WezTerm pane control on web/desktop**: replaced by runtime-native panes; keeping remote-controlling a terminal emulator from a GUI would be absurd plumbing.

## Related

- [[pibarm runtime PRD]] · [[pibarm runtime design]] · [[sessions and multiplexing]] · [[forge integration]]
