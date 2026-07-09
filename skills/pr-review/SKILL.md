---
name: pr-review
description: Review GitHub PRs or SourceHut patchsets with forge CLI tools, local checks, and concise actionable findings. Use when asked to review a PR, patch, branch, or merge request.
---

# PR / Patch Review

## Flow

1. Identify forge and branch with `repo_status`.
2. For GitHub, use `github_pr_status` and `github_ci_status` before reviewing.
3. For SourceHut, use `sourcehut_builds` and `hut`/local git as available.
4. Inspect the diff locally with `git diff`/`git show`.
5. Run the smallest relevant checks.
6. Report only actionable findings, with file paths.

## Review lens

- correctness bugs
- missing tests for changed behavior
- migration/data/security risks
- over-engineering to delete/simplify
- CI failures and likely root cause

Prefer worktrees for checking out external branches or risky patch application.
