![pibarm banner](assets/readme-banner.png)

# pibarm

TL;DR pi extensions + skills for safer agent workflows:

- plan first, edit later
- ask explicit questions before executing unclear plans
- notify locally when questions are waiting
- run risky/parallel work in git worktrees instead of the active repo
- use MCP tools through `mcporter`
- switch model/tool/thinking presets by role
- spawn isolated subagents, including parallel multi-model runs, when useful
- query managed semantic code intelligence without modifying project dependencies

## Quick start

Use from another project:

```bash
pi install git@github.com:leemeichin/pibarm.git
```

Pi installs the package and loads its extensions/skills on startup after you trust the project.

For local development or to customize config, clone this repo and run setup:

```bash
git clone git@github.com:leemeichin/pibarm.git
cd pibarm
bun install
bun run setup
pi
```

`bun run setup` copies missing local config examples and runs the setup doctor. Use `bun run doctor` later to re-check your environment.

For development, Pi is pinned exactly so CI is reproducible. The weekly compatibility job tests npm `latest` separately:

```bash
bun run audit:prompt       # prompt/tool context without a model request
bun run eval:agent --model=<provider/model> --variant=baseline
bun run check:pi-latest    # compare the development pin with npm latest
```

Architecture findings and measurement rules live in [`docs/agent-efficacy.md`](docs/agent-efficacy.md).

## External pi packages

This project asks pi to load one external package from `.pi/settings.json`:

- `git:github.com/DietrichGebert/ponytail`

Pi installs missing project packages automatically on startup after the project is trusted. To reconcile/update packages later:

```bash
pi update --extensions
```

## Setup doctor and external tools

`pibarm` itself is a Pi package, but some features shell out to local CLIs. Run:

```bash
bun run doctor
```

Required for core usage:

- `pi` — loads this package and runs subagents
- `git` — repo status and worktrees
- `bash` — watcher scripts and subagent wrappers

Feature-specific tools:

| Tool                | Enables                                                | Install/auth hint                                           |
| ------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| `bun`               | local development checks                               | `curl -fsSL https://bun.sh/install \| bash`                 |
| `gh`                | GitHub-backed `forge_*` tools and statusline PR checks | `brew install gh && gh auth login`                          |
| `hut`               | SourceHut-backed `forge_*` tools                       | `brew install hut && hut init`                              |
| `mcporter`          | MCP bridge tools and managed code intelligence         | install/configure `mcporter`, then edit `.pi/mcporter.json` |
| `uv` or `mise`      | isolated Serena language-server runtime                | `brew install uv` or use an existing `mise` installation    |
| `tmux`              | terminal-independent visible agent panes               | `brew install tmux`                                         |
| `terminal-notifier` | optional native macOS notifications                    | `brew install terminal-notifier`                            |

The TUI uses Nerd Font glyphs for the statusline, task widget, and rich planning questions; install a Nerd Font if icons render as boxes.

## pibarm settings and commit attribution

Use `/pibarm-settings` to edit global or project-scoped pibarm settings with Pi's native settings list. Project writes require a trusted project. The menu covers Git attribution, code intelligence, Obsidian export, and automatic agent panes; selecting **Save and close** atomically updates only changed values and preserves unknown settings.

Agent-created commits include this default-on, versioned trailer instruction. pibarm does not install Git hooks or rewrite commit messages:

```text
Co-authored-by: 🥧 pibarm v0.1.0
```

Disable it globally or in a trusted project:

```json
{
  "pibarm": {
    "git": {
      "commitTrailer": false
    }
  }
}
```

## Obsidian export

Configure Obsidian export in Pi settings. Global settings live at `~/.pi/agent/settings.json`; project overrides live at `.pi/settings.json`. Pi merges nested settings, so projects can override only `basePath` while using the global vault.

```json
{
  "pibarm": {
    "obsidian": {
      "vault": "path/to/obsidian/vault",
      "basePath": "Pi",
      "autoSync": true,
      "debounceMs": 2000,
      "includeAttachments": true
    }
  }
}
```

Use `/obsidian-status` to verify the resolved config and `/obsidian-export` to write the current session note. When `autoSync` is true, pibarm debounces session exports after turns and compaction. The vault path is local user config; do not commit vault folders or private `.pi/forge.json`/settings overrides to this repo.

Notes are organised as `<vault>/<basePath>/<forge org or user>/<repo>/<session>.md`, derived from the `origin` git remote (for example `Pi/example/project/fix-the-bug.md`); repos without a usable remote fall under `local/<directory name>`. Note names prefer the Pi session name, then a structured Jira key and title found in session context, then the current non-generic Git branch; `main`, `master`, `trunk`, and `develop` are skipped. Sessions without any name use their session id and are renamed once when the first name arrives. The selected note path then stays fixed, and a `.pibarm-sessions.json` index at the base path records which note belongs to which session. Tool calls and results are exported as compact, bounded rows instead of raw payloads.

## Main workflow

```text
/plan <task>
  ↓
pi inspects read-only and asks questions if needed
  ↓
you approve/refine the plan
  ↓
/execute-plan worktree <name>
  ↓
changes happen in a repo-local git worktree, not your active checkout
```

Use active-checkout execution only when you really want it:

```text
/execute-plan
```

Agent command execution is shell-first and fail-fast: prefer direct Unix tools, use `set -euo pipefail` for multi-step mutations, and reserve small Python snippets for cases where shell would be brittle or unsafe.

## Commands

| Command                                   | What it does                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `/plan <task>`                            | Enter read-only plan mode and ask for a plan.                             |
| `/plan-mode`                              | Toggle read-only plan mode manually.                                      |
| `/plan-show`                              | Show the last captured plan, status, and parsed steps.                    |
| `/approve-plan [active\|worktree <name>]` | Approve and execute the captured plan.                                    |
| `/refine-plan <feedback>`                 | Revise the captured plan and require approval again.                      |
| `/execute-plan`                           | Execute the last captured plan in the active checkout.                    |
| `/execute-plan worktree <name>`           | Execute the last captured plan in a new repo-local git worktree.          |
| `/worktrees`                              | List git worktrees for this repo.                                         |
| `/worktree-diff <path>`                   | Show status + diff stat for a worktree.                                   |
| `/worktree-remove [--force] <path>`       | Remove a worktree after review/merge/abandoning it.                       |
| `/tasks`                                  | Show all todo and delegated agent task widget items.                      |
| `/watchers`                               | List active watcher sibling agents.                                       |
| `/watcher-stop [name]`                    | Stop watcher sibling agents.                                              |
| `/preset`                                 | List configured role presets.                                             |
| `/preset planner`                         | Apply planner model/tool/thinking preset.                                 |
| `/preset executor`                        | Apply executor model/tool/thinking preset.                                |
| `/mcporter`                               | Show configured mcporter command templates.                               |
| `/mcporter <args...>`                     | Run raw mcporter args from inside pi.                                     |
| `/repo-status`                            | Show git/forge/CI status and update pi statusline.                        |
| `/forge [github\|sourcehut\|auto]`        | Show, set, or reset the remembered forge for this repo.                   |
| `/forge-prs`                              | List PRs/patches using the detected/configured forge.                     |
| `/forge-ci`                               | List CI/builds using the detected/configured forge.                       |
| `/forge-tickets`                          | List issues/tickets using the detected/configured forge.                  |
| `/review [#number\|url\|branch]`          | Start a PR/patch review; GitHub findings are posted inline when possible. |
| `/pibarm-settings`                        | Edit global or trusted-project pibarm settings.                           |
| `/obsidian-status`                        | Show Obsidian export settings resolved from Pi settings.                  |
| `/obsidian-export`                        | Export the current session to the configured Obsidian vault.              |
| `/agents [name]`                          | List managed agents or capture one agent's log.                           |
| `/agents-attach`                          | Focus the managed tmux window or show its attach command.                 |
| `/agents-kill [name\|all]`                | Stop managed agent panes without touching the parent tmux session.        |

## Tools exposed to the agent

All custom tools are registered, but only `search_tools`, `question`, `elicit_plan_questions`, and `todo_list` start active. `search_tools` enables matching code-intelligence, forge, MCP, delegation, worktree, watcher, or repository groups additively, so Pi can defer their schemas without replacing its stable prompt prefix. Applying a role preset can still select an explicit tool set.

| Tool                      | Purpose                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_tools`            | Find and enable registered pibarm tools for a task.                                                                                                               |
| `elicit_plan_questions`   | Ask several planning questions before finalizing/executing a plan, with rich TUI inputs for free text, select, multi-select, confirm/boolean, and number answers. |
| `question`                | Ask one focused question with optional choices.                                                                                                                   |
| `code_intel`              | Query definitions, references, hover details, symbols, and diagnostics through managed Serena language servers.                                                   |
| `create_git_worktree`     | Create an isolated repo-local git worktree and branch.                                                                                                            |
| `summarize_worktree_diff` | Summarize status/diff for a worktree.                                                                                                                             |
| `remove_git_worktree`     | Remove an isolated worktree after confirmation/review.                                                                                                            |
| `run_worktree_agent`      | Create/use a worktree and run an agent there, using automatic tmux rendering or headless fallback.                                                                |
| `run_subagent`            | Run one isolated agent with automatic tmux rendering or headless fallback; defaults to a 10 minute timeout.                                                       |
| `run_subagents`           | Run up to four agents in parallel with the same configured renderer; defaults to a 10 minute timeout per job.                                                     |
| `watch_agent`             | Start/list/stop a sibling watcher agent for PR reviews, checks, or external state changes.                                                                        |
| `mcporter_list`           | Discover MCP servers/tools through `mcporter`.                                                                                                                    |
| `mcporter_call`           | Call MCP tools through `mcporter`.                                                                                                                                |
| `mcporter_resource`       | List/read MCP resources through `mcporter`.                                                                                                                       |
| `repo_status`             | Summarize branch, dirty files, forge, PR, and CI status.                                                                                                          |
| `forge_status`            | Detect/show the configured forge for the current repository.                                                                                                      |
| `forge_prs`               | List PRs/patches using the detected/configured forge.                                                                                                             |
| `forge_pr_status`         | Inspect current/selected PR/patch review and check status.                                                                                                        |
| `forge_ci_status`         | List CI/builds using the detected/configured forge.                                                                                                               |
| `forge_tickets`           | List issues/tickets using the detected/configured forge.                                                                                                          |
| `todo_list`               | Track progress when one prompt contains multiple requested tasks in the shared task widget.                                                                       |

## Managed code intelligence

`code_intel` is deferred until `search_tools` matches semantic navigation, diagnostics, LSP, or language-server work. It delegates language detection, server lifecycle, and support for mixed-language projects to pinned [Serena](https://github.com/oraios/serena) 1.6.1 instead of maintaining a second LSP client and server catalog in pibarm.

The first trusted call prefers an existing `uv`/`uvx`; if neither exists and `mise` is available, pibarm installs pinned `uv` into its own cache. Serena, Python, indexes, and language servers stay under the Pi agent cache rather than the project or global package directories, with concurrent installation serialized per project. Host toolchains required by a language server, such as Ruby itself, remain prerequisites; an already-installed mise Ruby is selected automatically. `PI_OFFLINE=1` disables acquisition and uses only file types that have completed a cached online query. Disable the feature or automatic acquisition globally or in a trusted project with:

```json
{
  "pibarm": {
    "codeIntel": {
      "enabled": true,
      "autoInstall": false,
      "timeoutMs": 300000
    }
  }
}
```

Projects must be trusted, requested files must resolve inside the project root, subprocesses use argument arrays, and model-facing output is capped at 20,000 characters. If Serena or a language server is unavailable, the tool reports that honestly so the agent can fall back to `rg`, `read`, and project checks.

## Rich planning questions

`elicit_plan_questions` accepts either strings or typed question objects. Strings become free-text prompts. Objects can use `type: "free_text"`, `"select_one"`, `"select_many"`, `"confirm"`, `"boolean"`, or `"number"`, plus optional `label`, `options`, `default`, `min`, `max`, `preview`/`actionPreview`, `notes`, and `allowCustom`.

```json
{
  "questions": [
    {
      "label": "Scope",
      "question": "What should change?",
      "type": "select_many",
      "options": ["UI", "Tool schema", "Docs"]
    },
    {
      "label": "Proceed",
      "question": "Apply schema changes?",
      "type": "confirm",
      "preview": "Keeps string questions backward-compatible."
    },
    { "label": "Retries", "question": "How many retries?", "type": "number", "default": 2, "min": 0, "max": 5 }
  ]
}
```

The TUI is tabbed, has Nerd Font status icons, supports option descriptions/previews, and lets you add per-question notes with `n`.

## Task widget

`todo-list.ts`, subagents, worktree agents, and watcher agents share one compact widget below the editor/above the status line. It renders clean horizontal pills such as `‹ ○ 1 · inspect auth › ‹ ● sub scout · tmux-agents › ‹ ✓ sub reviewer · gpt-5-mini ›` so delegated work stays visually connected to the parent session without a tall vertical list. Use `/tasks` for the expanded view when pills overflow.

## Watcher agents

`watch_agent` starts a sibling watcher that polls external state and runs a headless Pi task only when the observed state changes. The primary use case is PR follow-up while the parent Pi session remains active:

```text
watch_agent(action=start, pr="123", goal="Keep this PR moving toward approval", loop="Watch for review comments, requested changes, and failed checks; respond only when useful")
```

It accepts either legacy `task` or Claude Code-style `goal` + `loop`. Each detected change is durably queued, fed into the parent session, and wakes the parent model automatically. Opening or updating a draft/non-draft PR starts a watcher without another confirmation. GitHub watches PR/check status, SourceHut falls back to forge-native builds, and unsupported forges require an explicit `watchCommand`. Watchers write logs under `.pi/watchers/`, appear in the shared task widget, and can be stopped with `/watcher-stop [name]` or `watch_agent(action=stop, name="...")`.

## Plan mode behavior

When plan mode is active:

- only read/inspection, MCP discovery/resource, and question tools are active; all other tool calls are blocked
- bash uses a strict command allowlist and rejects redirection, substitution, executable search hooks, and write-capable git options
- pi is instructed to ask clarifying questions when scope/risks/acceptance criteria are unclear
- final plans should include validation steps and whether worktree execution is recommended

After a plan is captured, pi prompts you to:

- approve execution in a worktree
- approve execution in the active checkout
- refine the plan, then require approval again
- keep the plan for later

You can also use `/approve-plan [active|worktree <name>]` or `/refine-plan <feedback>` after the prompt. Refinements preserve the current captured plan as context and replace it only when a revised plan is captured.

## Worktrees

`/execute-plan worktree feature-x` creates a repo-local checkout like:

```text
.pi/wt/feature-x
```

with branch:

```text
pibarm/feature-x
```

The agent is instructed to make changes under that worktree path, preserving your active checkout. `.pi/wt/` is gitignored.

Review and cleanup:

```text
/worktrees
/worktree-diff .pi/wt/feature-x
/worktree-remove .pi/wt/feature-x
```

For agent-driven review, ask pi to use `summarize_worktree_diff`.

## Automatic tmux agent panes

`run_subagent`, `run_subagents`, and `run_worktree_agent` use one shared runner. With tmux available they stream into a managed tiled window; without tmux they keep the same headless behavior and report one fallback notice. Watchers remain background task pills.

```json
{
  "pibarm": {
    "agentPanes": {
      "enabled": "auto",
      "include": ["subagent", "worktree"],
      "outsideTmux": "detached",
      "layout": "tiled"
    }
  }
}
```

Inside tmux, pibarm creates a dedicated window in the current session and never kills the parent session. Outside tmux, the default creates a detached session and prints `tmux attach -t ...`; pibarm never launches or controls a terminal application. Set `outsideTmux` to `headless`, remove a tool kind from `include`, or set `enabled` to `false` to opt out.

Agent reasoning, responses, and tool activity render live while the standard tool waits and returns the captured result. Logs live under `.pi/agents/`. Use `/agents` to list runs, `/agents <name>` to capture a log, `/agents-attach` to focus/show the attach command, and `/agents-kill all` for cleanup. Concurrent delegation keeps the existing four-agent limit and lets tmux tile the panes without another confirmation flow.

## Notifications and permission gates

`waiting-notify.ts` sends a local terminal/native notification when `question` or `elicit_plan_questions` is waiting. It uses Kitty's notification escape when running in Kitty, `terminal-notifier` when `PI_NOTIFY_TERMINAL_NOTIFIER` is set, and otherwise falls back to the common iTerm2-style terminal notification escape.

Optional notification env vars:

```bash
export PI_NOTIFY_TERMINAL_NOTIFIER=/opt/homebrew/bin/terminal-notifier # optional
export PI_NOTIFY_COOLDOWN_SECONDS=60                                   # optional
export PI_NOTIFY_INCLUDE_QUESTION=1                                    # optional; include question args in notification body
```

`permission-gate.ts` is disabled by default because the current heuristic is too intrusive. Set `PI_PERMISSION_GATE=1` to temporarily re-enable risky bash/write prompts while the smarter gate is redesigned.

## Inline shell and easter eggs

Type `!<command>` as a prompt to run a local shell command immediately and show the output in the transcript, without invoking the model. `!!` is left to Pi's built-in bash handling.

```text
!git status --short
```

`ar-kid.ts` is a small local easter egg: prompts containing `ar kid` ask the model to answer in a warm Manchester/Bolton dialect. If the entire prompt is exactly `alright ar kid`, Pi echoes `alright ar kid` locally without invoking the model.

## Forge/statusline integrations

`repo-status.ts` installs a colorful icon-first footer with project/model/context/thinking on the left and repo/forge/CI status on the right. It includes dirty/uncommitted diff stats, detects Jira-style ticket IDs from branch names, and filters Ponytail extension chatter. Example:

```text
󰚅 pibarm · 󰚩 anthropic/Sonnet 4 5 · 󰊚 ctx 37%         main ±2 ·  #12 ·  CI
```

Colour mapping (mirrors the pibarm design system's StatusLine):

- Left: orange project, plain model, muted context
- Branch: plain, with muted dirty/diff stats
- PR: green (pea) open, grey draft, plum merged, red (tomato) closed
- CI: green pass, mustard running, red failing, grey unknown

## pibarm theme

`.pi/themes/` ships `pibarm-dark` and `pibarm-light` pi themes built from the design-system palette: cream text on navy for dark terminals, navy ink on cream for light ones, with the orange-dot accent and the pea/sky/mustard/tomato/plum status set. The package manifest exposes them globally when pibarm is installed, while `.pi/settings.json` sets `"theme": "pibarm-light/pibarm-dark"` so pi auto-switches with the terminal background; pick one explicitly with `/theme`.

It uses local CLI auth only:

- GitHub: `gh` (`gh auth login`)
- SourceHut: `hut`

No tokens are stored in this repo. Forge tools detect GitHub vs SourceHut from `origin`; when detection is unclear, `/forge` asks once and remembers the answer in ignored local config `.pi/forge.json`.

## Mcporter

`mcporter` is used as the MCP CLI bridge. Configure command templates in:

```text
.pi/mcporter.json
```

Default call template (`callArgs`):

```json
["call", "{selector}", "--args", "{argumentsJson}", "--output", "json"]
```

There are also `listArgs` and `resourceArgs` templates for discovery/resource tools.

Placeholders:

- `{server}`
- `{tool}`
- `{selector}` = `server.tool`
- `{argumentsJson}`
- `{schemaFlag}`
- `{uri}`

Useful direct checks:

```bash
mcporter list --json
mcporter list <server> --schema --json
mcporter call <server.tool> --args '{"key":"value"}' --output json
```

## Presets

Configure role presets in:

```text
.pi/agent-presets.json
```

Start from:

```bash
cp .pi/agent-presets.example.json .pi/agent-presets.json
```

Presets can set:

- provider/model
- thinking level
- active tools

## Skills

Available skill commands:

- `/skill:pr-open`
- `/skill:plan-worktree`
- `/skill:mcporter`
- `/skill:agent-orchestration`
- `/skill:model-presets`
- `/skill:python`
- `/skill:ruby`
- `/skill:typescript`
- `/skill:pr-review`
- `/skill:ci-triage`

## Files

```text
AGENTS.md                     # single always-on project instruction source
SECURITY.md                   # local security policy
extensions/prompt-context.ts  # keep worktree prompt context inside its git root
extensions/plan-worktree.ts   # plan mode, elicitation, worktrees
extensions/question.ts        # single-question user prompt tool
extensions/mcporter.ts        # mcporter MCP bridge
extensions/forge.ts            # forge-aware GitHub/SourceHut tools
extensions/review.ts           # /review command for PR/patch review handoff
extensions/pibarm-settings.ts  # settings menu and commit trailer instruction
extensions/obsidian.ts         # Obsidian session export commands/autosync
extensions/repo-status.ts      # git/forge/CI statusline
extensions/waiting-notify.ts   # local terminal/native notifications for pending questions
extensions/permission-gate.ts  # opt-in confirmation gate for risky/out-of-project actions
extensions/ar-kid.ts           # Manchester/Bolton dialect easter egg
extensions/todo-list.ts        # compact todo tracking for multi-task prompts
extensions/watch-agent.ts      # sibling watcher agents for PRs/checks/external state
extensions/usage-limit-status.ts # statusline warning when provider usage limits are hit
extensions/agent-presets.ts   # presets and single/parallel subagents
lib/agent-runner.ts           # shared headless/tmux child-agent runner
lib/pibarm-settings.ts        # merged Pi settings helper for pibarm namespace
lib/obsidian-export.ts        # Obsidian Markdown session exporter
scripts/agent-render.mjs      # readable live transcript for tmux panes
skills/*/SKILL.md             # progressive-disclosure workflows
prompts/plan-execute.md       # reusable plan/execute prompt
prompts/pr-open.md            # newline-safe PR opening prompt
scripts/doctor.mjs            # onboarding/setup doctor for local CLI dependencies
.pi/themes/pibarm-dark.json   # design-system pi theme (dark terminals)
.pi/themes/pibarm-light.json  # design-system pi theme (light terminals)
.pi/*.example.json            # local config examples
```
