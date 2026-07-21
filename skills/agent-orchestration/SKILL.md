---
name: agent-orchestration
description: Plan and execute work with dedicated planner, executor, and subagent flows in pi. Use for multi-step tasks, delegation, verification, or when switching models/tools by role.
---

# Agent Orchestration

Use this skill for complex work that benefits from explicit roles. If a named orchestration tool is inactive, call `search_tools` with the needed capability before continuing.

## Roles

- Planner: read-only, asks clarifying questions, writes a concise plan, avoids file changes.
- Elicitor: uses `elicit_plan_questions` to ask about scope, risks, tradeoffs, and execution location before approval.
- Executor: implements approved changes, ideally in an isolated git worktree, runs checks, summarizes modified files.
- Subagent: isolated research, verification, comparison, or implementation via `run_subagent`, `run_subagents`, or `run_worktree_agent`.
- Todo tracker: use `todo_list` for prompts with multiple requested tasks; keep it short and mark items done as work completes. Todos and delegated agents appear together as horizontal pills in the shared task widget.
- Watcher: use `watch_agent` when the user wants a sibling task to monitor a PR, review comments, checks, or external state while the parent Pi session continues. Watcher changes wake the parent model automatically. Start one without asking after opening or updating any draft/non-draft PR. Prefer Claude Code-style `goal` + `loop` fields; `task` remains accepted for simple cases.
- Agent panes: standard subagent/worktree tools render in tmux automatically when configured and available; no separate delegation API is needed.

## Commands

- `/preset` lists presets from `.pi/agent-presets.json`.
- `/preset planner` switches to the planner model/tools.
- `/preset executor` switches to the executor model/tools.
- `/plan <task>` enters read-only plan mode and asks for a plan.
- `/plan-mode` toggles read-only plan mode.
- `/approve-plan [active|worktree <name>]` approves and executes the captured plan.
- `/refine-plan <feedback>` revises the captured plan and requires approval again.
- `/execute-plan` executes the last captured plan in the active checkout.
- `/execute-plan worktree <name>` executes the last captured plan in a repo-local git worktree.
- `/agents`, `/agents-attach`, and `/agents-kill` inspect, focus, or stop managed tmux panes.

## Delegation Guidance

Use `run_worktree_agent` when the subtask may modify files or should not affect the active checkout. Use `run_subagent` for one self-contained read-only subtask. Use `run_subagents` when comparing or delegating several read-only subtasks, especially across models. `pibarm.agentPanes` decides whether those same tools render in tmux or run headlessly; watchers remain background task pills. Examples:

- inspect unfamiliar docs and summarize them
- compare alternatives across models
- run planner/reviewer/verifier subagents in parallel
- produce a focused checklist

Subagent and watcher prompts must include all necessary context. Do not assume they can see the active conversation. Subagents default to the current active model unless a `model` is set explicitly; simple-scope tasks may be downgraded to a lighter authenticated model by the parent-side heuristic. For PR follow-up, prefer `watch_agent` with a PR number/URL, a concise `goal`, and a `loop` that states when it may comment or push changes.

For tmux rendering:

- use worktrees for separate branch work and the current checkout for same-branch distributed work
- standard delegation tools wait for completion and return captured logs exactly as in headless mode
- inside tmux, agents use a managed tiled window; outside tmux, the default is a detached session with an attach command
- use `/agents-kill all` for forced cleanup; never kill the parent tmux session
