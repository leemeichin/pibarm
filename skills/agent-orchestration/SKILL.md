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
- Subagent: isolated research, verification, or implementation via `run_subagent` or `run_worktree_agent`.

## Commands

- `/preset` lists presets from `.pi/agent-presets.json`.
- `/preset planner` switches to the planner model/tools.
- `/preset executor` switches to the executor model/tools.
- `/plan <task>` enters read-only plan mode and asks for a plan.
- `/plan-mode` toggles read-only plan mode.
- `/execute-plan` executes the last captured plan in the active checkout.
- `/execute-plan worktree <name>` executes the last captured plan in a separate git worktree.

## Delegation Guidance

Use `run_worktree_agent` when the subtask may modify files or should not affect the active checkout. Use `run_subagent` when the subtask is self-contained and read-only, for example:

- inspect unfamiliar docs and summarize them
- compare alternatives
- run a verification pass against a completed change
- produce a focused checklist

Subagent prompts must include all necessary context. Do not assume the subagent can see the active conversation.
