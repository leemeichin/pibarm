# pibarm

TL;DR pi extensions + skills for safer agent workflows:

- plan first, edit later
- ask explicit questions before executing unclear plans
- run risky/parallel work in git worktrees instead of the active repo
- use MCP tools through `mcporter`
- switch model/tool/thinking presets by role
- spawn isolated subagents when useful

## Quick start

From this repo:

```bash
cp .pi/mcporter.example.json .pi/mcporter.json
cp .pi/agent-presets.example.json .pi/agent-presets.json
pi
```

Trust the project when prompted. Pi loads project resources from `.pi/settings.json`.

Use from another project:

```bash
pi install path/to/pibarm
```

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
changes happen in a sibling git worktree, not your active checkout
```

Use active-checkout execution only when you really want it:

```text
/execute-plan
```

## Commands

| Command | What it does |
|---|---|
| `/plan <task>` | Enter read-only plan mode and ask for a plan. |
| `/plan-mode` | Toggle read-only plan mode manually. |
| `/plan-show` | Show the last captured plan and parsed steps. |
| `/execute-plan` | Execute the last captured plan in the active checkout. |
| `/execute-plan worktree <name>` | Execute the last captured plan in a new sibling git worktree. |
| `/worktrees` | List git worktrees for this repo. |
| `/worktree-diff <path>` | Show status + diff stat for a worktree. |
| `/worktree-remove [--force] <path>` | Remove a worktree after review/merge/abandoning it. |
| `/preset` | List configured role presets. |
| `/preset planner` | Apply planner model/tool/thinking preset. |
| `/preset executor` | Apply executor model/tool/thinking preset. |
| `/mcporter` | Show configured mcporter command templates. |
| `/mcporter <args...>` | Run raw mcporter args from inside pi. |

## Tools exposed to the agent

| Tool | Purpose |
|---|---|
| `elicit_plan_questions` | Ask several planning questions before finalizing/executing a plan. |
| `question` | Ask one focused question with optional choices. |
| `create_git_worktree` | Create an isolated sibling git worktree and branch. |
| `summarize_worktree_diff` | Summarize status/diff for a worktree. |
| `remove_git_worktree` | Remove an isolated worktree after confirmation/review. |
| `run_worktree_agent` | Create/use a worktree and run `pi -p` there. |
| `run_subagent` | Run an isolated non-interactive `pi -p` subagent. |
| `mcporter_list` | Discover MCP servers/tools through `mcporter`. |
| `mcporter_call` | Call MCP tools through `mcporter`. |
| `mcporter_resource` | List/read MCP resources through `mcporter`. |

## Plan mode behavior

When plan mode is active:

- `edit` and `write` are disabled
- bash is restricted to read-only-ish commands
- pi is instructed to ask clarifying questions when scope/risks/acceptance criteria are unclear
- final plans should include validation steps and whether worktree execution is recommended

After a plan is captured, pi prompts you to:

- ask/refine before executing
- approve execution in a worktree
- approve execution in the active checkout
- stay in plan mode

## Worktrees

`/execute-plan worktree feature-x` creates a sibling checkout like:

```text
../<repo>-worktree-feature-x
```

with branch:

```text
pibarm/feature-x
```

The agent is instructed to make changes under that worktree path, preserving your active checkout.

Review and cleanup:

```text
/worktrees
/worktree-diff ../<repo>-worktree-feature-x
/worktree-remove ../<repo>-worktree-feature-x
```

For agent-driven review, ask pi to use `summarize_worktree_diff`.

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

- `/skill:plan-worktree`
- `/skill:mcporter`
- `/skill:agent-orchestration`
- `/skill:model-presets`

## Files

```text
extensions/plan-worktree.ts   # plan mode, elicitation, worktrees
extensions/question.ts        # single-question user prompt tool
extensions/mcporter.ts        # mcporter MCP bridge
extensions/agent-presets.ts   # presets and generic subagent
skills/*/SKILL.md             # progressive-disclosure workflows
prompts/plan-execute.md       # reusable plan/execute prompt
.pi/*.example.json            # local config examples
```
