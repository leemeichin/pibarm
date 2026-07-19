---
title: forge integration
stage: design
status: draft
created: 2026-07-19
tags:
  - pibarm
  - runtime
  - design
  - forge
hub: "[[pibarm runtime design]]"
---

# forge integration

The deep-forge layer from [[pibarm runtime PRD]] F8 and [[pibarm runtime design]] D6/D7/D11. Targets: GitHub and SourceHut at full depth, AGit-protocol forges (Forgejo, Gitea) as the P1 follow.

> Assumption carried from the PRD's open questions: "sourceforge" in the original request is read as **SourceHut**, which pibarm already integrates via `hut`. If literal SourceForge is wanted, it slots in as another adapter with reduced capabilities.

## The adapter contract (D6)

One interface, capability-flagged, host-side. Today's `forge.ts` (detection, `gh`/`hut` wrappers, `.pi/forge.json` memory) is the seed; it grows a review surface and loses its CLI-only assumption.

```ts
interface ForgeAdapter {
  id: "github" | "sourcehut" | "forgejo" | …;
  detect(remoteUrl: string): number;            // confidence, replaces current heuristics
  capabilities(): ForgeCaps;                    // see table
  auth(): AuthState;                            // cli | token | none

  changes(filter): Change[];                    // PRs / patchsets / AGit topics
  change(id): ChangeDetail;                     // commits, diff refs, threads, checks
  publish(opts): Change;                        // open PR / send patchset / agit push
  ci(filter): Build[];                          // checks / builds.sr.ht pipelines
  ciLog(build): BoundedLog;
  tickets(filter): Ticket[];                    // issues / todo.sr.ht
  review: {
    open(change): ReviewDraft;
    comment(draft, thread | line, body): void;  // inline where supported
    submit(draft, verdict): void;
  };
  watch(change): AsyncIterable<ForgeEvent>;     // feeds the watcher service
}
```

Capability flags (advertised through the host handshake, so clients hide what a forge can't do):

| Capability | GitHub | SourceHut | Forgejo/Gitea (AGit) |
| --- | --- | --- | --- |
| changes list/detail | yes (PRs) | yes (patchsets via lists.sr.ht) | yes (PRs) |
| inline diff comments | yes | approximated (quoted-line email reply) | yes |
| review verdicts | approve/request-changes | reply conventions (`Reviewed-by:` etc.) | approve/request-changes |
| CI + logs | checks API | builds.sr.ht | Actions-compatible API |
| tickets | issues | todo.sr.ht | issues |
| publish | PR from branch | `git send-email` patchset | **AGit push** or classic PR |
| watch events | webhooks n/a locally → poll; watcher cadence | poll | poll |

## The review-threads model (D7)

The unifying abstraction is a **changeset with threads**, not a PR:

- `Change`: id, title, author, target, state (`open/draft/merged-or-applied/closed/superseded`), versions (GitHub: force-push history; SourceHut: patchset v1/v2/…; AGit: topic iterations).
- `Thread`: anchored to a file+line range of a specific version, or to the change as a whole; carries messages; knows whether its anchor survived the latest version.
- `Verdict`: per-reviewer state mapped per forge (approval, `Reviewed-by`, etc.).

GitHub maps down losslessly. SourceHut maps email review into threads: a reply quoting a diff hunk anchors to that hunk; unanchorable replies become change-level threads. Publishing a SourceHut review means rendering the draft threads back into a correctly-quoted email via `hut`/`git send-email`. This is the hard 20% and it is exactly the part that makes SourceHut first-class rather than shimmed.

Versions matter everywhere: the review workspace shows "thread anchored to v2, now at v4" instead of silently mislocating comments.

## Depth features (the actual point)

All host-side services over the adapters, rendered by every surface ([[parity matrix]] forge rows):

1. **Review inbox** — one list across configured forges: awaiting my review, my open changes with state deltas (new comments, CI transitions), failing CI on my changes. Menu-bar/dock counts on macOS, notification fan-out via the watcher service.
2. **Review workspace** — diff viewer + thread rail + agent findings. `/review` seeds it: the agent's findings arrive as draft threads the user edits/deletes/approves before submitting as one review. Web/desktop UIs in [[web client]] and [[macos app]].
3. **CI triage loop** — failing build → bounded log fetch → `ci-triage` skill in a background agent → proposed fix as a plan → worktree execution → publish. Every step already exists in the TUI as separate verbs; this wires them into one flow.
4. **Ticket-to-plan** — pick a ticket, `/plan` seeded with its content and link; on publish, the change references the ticket per forge convention.
5. **Publish + watch** — opening/updating a change auto-starts a watcher (today's behaviour, now host policy).

## AGit protocol (D11)

AGit is publish-side: `git push origin HEAD:refs/for/<target> -o topic=<name> -o title=… -o description=…` creates or updates a change without a fork or a pushed branch. Design:

- Implement in the **git layer** as a publish strategy, selected when the adapter advertises `publish: agit`.
- Topic name defaults to the worktree branch (`pibarm/<name>` → topic `<name>`); iteration = push again to the same topic.
- Review side uses the Forgejo/Gitea REST API (threads, verdicts, CI) — protocol gets you publish, API gets you depth; both are needed for the full loop.
- Certify against Forgejo (Codeberg) first, then Gitea; where they diverge, capability-flag rather than branch.
- Nice-to-have inherited from the request: any forge that speaks AGit gets publish support even before a bespoke adapter exists (a `generic-agit` adapter with publish + poll-only watching).

## Auth (D6, G5)

Priority order per adapter: existing CLI auth (`gh`, `hut`) when the binary is present and authenticated → per-forge token from the OS keychain (macOS Keychain; libsecret on Linux) entered once through a client → unauthenticated read-only where the forge allows. Tokens never touch repo config or the journal; the journal records *that* a forge call happened, not its credentials. Details in [[security, permissions and notifications]].

## Issue seeds (M4–M5)

- extract `forge.ts` into host forge service; adapter registry + detection confidence
- changes/threads/versions model + journal event kinds (`forge_event`)
- GitHub adapter: threads mapping, review submit, checks + log bounding
- SourceHut adapter: patchset threading, quoted-email review rendering, builds.sr.ht, todo.sr.ht
- review inbox service + notification wiring
- review workspace (web, then macOS)
- CI triage flow orchestration
- ticket-to-plan seeding
- AGit publish strategy in git layer; `generic-agit` adapter; Forgejo adapter for review depth
- keychain token storage + auth state UI

## Related

[[pibarm runtime design]] · [[parity matrix]] · [[security, permissions and notifications]] · [[web client]] · [[macos app]]
