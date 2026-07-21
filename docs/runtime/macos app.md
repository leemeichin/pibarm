---
title: macos app
stage: design
status: draft
created: 2026-07-19
tags:
  - pibarm
  - runtime
  - design
  - macos
hub: "[[pibarm runtime design]]"
---

# macos app

The native desktop surface from [[pibarm runtime PRD]] F3, decision D9 in [[pibarm runtime design]]. "Native" is the requirement, so this is a SwiftUI app speaking the [[runtime core and protocol|ACP boundary]] directly — not a webview shell. The cross-platform alternative was weighed and recorded at D9; Windows/Linux take the other road ([[windows and linux]]).

## Shell

- SwiftUI lifecycle, macOS 14+, Apple silicon first (Intel via Rosetta untested but unblocked).
- Multi-window: main window (sessions), per-agent windows (detached panes), review windows, settings. Window restoration across relaunch.
- Full menu bar with every command; keyboard shortcuts mirror the CLI slash commands; a command palette (`cmd+k`) with the same registry as the web's.
- Connects to `pibarmd` over the unix socket when local (spawning/adopting the launchd agent if not running — the app can own host lifecycle on this platform), or the ACP-shaped WebSocket adapter for remote hosts. Host credentials live in Keychain. Multiple host profiles are supported.

## Native affordances (the reason this app exists)

| Affordance     | Behaviour                                                                                                                                                                                                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notifications  | `UNUserNotificationCenter` with **actions**: confirm-type questions get Approve/Decline buttons; free-text gets inline reply; watcher events get Open Session. Answering from the notification resolves the originating ACP permission request or `_pibarm/question/create` request without opening the app window. This is the PRD's time-to-answer metric, made real. |
| Dock badge     | count of waiting questions across sessions                                                                                                                                                                                                                                                                                                                              |
| Menu bar extra | glanceable runtime state: sessions running, questions waiting, review inbox count, worst CI state — the StatusLine, hoisted into the macOS status bar. Popover with quick actions.                                                                                                                                                                                      |
| Focus modes    | respects system Focus; quiet-hours mapping to notify cooldowns ([[security, permissions and notifications]])                                                                                                                                                                                                                                                            |
| Finder/Files   | reveal worktrees, drag a diff out as a patch file                                                                                                                                                                                                                                                                                                                       |
| URI scheme     | `pibarm://session/<id>…` for Obsidian deep links (PRD F9) and notification click-through                                                                                                                                                                                                                                                                                |
| Appearance     | automatic light/dark using the pibarm palette mapped to native semantics — cream/navy, orange-dot accent, the pea/sky/mustard/tomato/plum status set. Terminal-native views use the mono glyph set `○ ● ✓ ! ±` on `--surface-code`, same as the ds's `variant="term"` components.                                                                                       |

## Main views

- **Session list** (sidebar): grouped by repo, live state glyphs, review inbox and watchers as top-level items — same IA as the web on purpose.
- **Transcript**: native rendering of journal events; tool calls as compact disclosure rows (bounded-payload invariant); embedded terminal view (SwiftTerm or similar) only where a child process is genuinely interactive, per the non-goals in [[pibarm runtime PRD]].
- **Agent grid**: the [[sessions and multiplexing]] renderer done natively — `NSSplitView`-style resizable grid, bounded visible agents per policy, overflow to a separate window when needed, and keyboard focus cycling. Any pane pops out to its own window.
- **Plan view**: structured plan as a native document — steps, validation, refinement history; approve/refine/execute in the toolbar and menu.
- **Elicitation**: sheets/popovers per question type; multi-question batches as a paged sheet mirroring the TUI tabs; notes field on every question.
- **Review workspace**: native side-by-side diff (this is where native earns its keep over the web), thread rail with version anchors, draft-findings editing, submit per [[forge integration]] capability flags.
- **Worktrees**: table with status/diff stat; diff opens in the review diff view; remove with recap confirm.

## Implementation notes

- Protocol client as a Swift package (`PibarmKit`): generated ACP standard types plus generated `_pibarm/*` extension types over `Network.framework`/`URLSessionWebSocketTask`. Only the extension schema is owned here; upstream ACP types stay identifiable so Swift and TS cannot drift silently.
- Journal replay/tail store mirrors the web's design; virtualised transcript lists.
- The app lives in a new `apps/macos/` directory (or a sibling repo if signing/CI ergonomics demand it — leaning in-repo until proven painful; issue seed to decide with CI).

## Distribution

Recommendation (PRD open question): **direct download, Developer ID signed + notarised, Sparkle for updates**. MAS sandboxing fights the entire premise (spawning pi, arbitrary repo access, unix sockets). Homebrew cask once releases stabilise.

## Issue seeds (M3)

- `PibarmKit` protocol package + schema-generated types
- app skeleton: host connect/adopt, session list, transcript
- elicitation sheets for all question types
- actionable notifications + dock badge
- agent grid + pane policy + pop-out windows
- plan view
- native diff viewer + review workspace (M4 tie-in)
- menu bar extra
- worktree table + Finder integration
- URI scheme + Obsidian deep links
- signing/notarisation/Sparkle pipeline; in-repo vs sibling-repo decision

## Related

[[pibarm runtime design]] · [[runtime core and protocol]] · [[sessions and multiplexing]] · [[forge integration]] · [[windows and linux]] · [[parity matrix]]
