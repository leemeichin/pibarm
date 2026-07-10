---
name: agent-orchestration
description: Plan and execute work with dedicated planner, executor, and subagent flows in pi. Use for multi-step tasks, delegation, verification, or when switching models/tools by role.
---

# Agent Orchestration

Use this skill for complex work that benefits from explicit roles.

## Roles

- Planner: read-only, asks clarifying questions, writes a concise plan, avoids file changes.
- Elicitor: uses `elicit_plan_questions` to ask about scope, risks, tradeoffs, and execution location before approval.
- Executor: implements approved changes, ideally in an isolated git worktree, runs checks, summarizes modified files.
- Subagent: isolated research, verification, comparison, or implementation via `run_subagent`, `run_subagents`, or `run_worktree_agent`.
- Todo tracker: use `todo_list` for prompts with multiple requested tasks; keep it short and mark items done as work completes.
- Matrix: use `matrix_*` tools when the user wants visible WezTerm panes/tabs/splits controlled by the parent Pi.

## Commands

- `/preset` lists presets from `.pi/agent-presets.json`.
- `/preset planner` switches to the planner model/tools.
- `/preset executor` switches to the executor model/tools.
- `/plan <task>` enters read-only plan mode and asks for a plan.
- `/plan-mode` toggles read-only plan mode.
- `/execute-plan` executes the last captured plan in the active checkout.
- `/execute-plan worktree <name>` executes the last captured plan in a repo-local git worktree.
- `/matrix <task>` starts a WezTerm Matrix with parent-controlled scout/planner panes.

## Delegation Guidance

Use `run_worktree_agent` when the subtask may modify files or should not affect the active checkout. Use `run_subagent` for one self-contained read-only subtask. Use `run_subagents` when comparing or delegating several read-only subtasks, especially across models, for example:

- inspect unfamiliar docs and summarize them
- compare alternatives across models
- run planner/reviewer/verifier subagents in parallel
- produce a focused checklist

Subagent prompts must include all necessary context. Do not assume the subagent can see the active conversation.

For Matrix/WezTerm orchestration:

- use worktrees for separate branch work
- use the current checkout for same-branch distributed work
- capture pane output before summarizing or acting on subagent results
- kill Matrix panes after completion unless the user asks to keep them
