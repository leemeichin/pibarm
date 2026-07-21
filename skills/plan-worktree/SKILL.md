---
name: plan-worktree
description: Use pi's read-only plan mode with elicitation and isolated git worktree execution. Use when a task should be planned before changes, needs user approval, or should run safely outside the active checkout.
---

# Plan Worktree

Use this workflow for non-trivial or risky code changes. If worktree tools are inactive, enable the worktree group with `search_tools` before execution.

## Flow

1. Enter plan mode with `/plan <task>`.
2. Inspect only. Do not edit files.
3. Ask one focused question with `question`, or multiple clarifying questions with `elicit_plan_questions`, when scope, risks, acceptance criteria, or execution location are unclear.
4. Produce a concise plan with validation steps and risks.
5. Wait for approval. If the user gives feedback, refine the captured plan and require approval again.
6. Prefer executing with `/approve-plan worktree <name>` or `/execute-plan worktree <name>` so changes happen in a repo-local git worktree, not the active checkout.

## Tools

- `question`: ask one focused user question with optional choices.
- `elicit_plan_questions`: ask the user multiple questions before finalizing/executing a plan; supports rich tabbed TUI inputs (`free_text`, `select_one`, `select_many`, `confirm`/`boolean`, `number`) with optional notes/previews.
- `create_git_worktree`: create a repo-local worktree and branch.
- `summarize_worktree_diff`: review status/diff from a worktree.
- `remove_git_worktree`: remove a worktree after confirmation/review.
- `run_worktree_agent`: create a repo-local worktree and run `pi -p` there; defaults to the current active model unless `model` is set, and may use a lighter authenticated model for simple-scope tasks.

## Commands

- `/plan-show`: show the captured plan, status, and parsed steps.
- `/refine-plan <feedback>`: revise the captured plan and require approval again.
- `/approve-plan [active|worktree <name>]`: approve and execute the captured plan.

## Rules

- In plan mode, only inspection and question tools are enabled. Bash is allowlisted; use dedicated `find`/`grep` tools instead of shell `find`, `awk`, or `sed`.
- For worktree execution, all file paths and commands must target the worktree path.
- Report the worktree path, branch, checks run, and changed files.
- After execution, review with `summarize_worktree_diff` before suggesting merge or cleanup.
