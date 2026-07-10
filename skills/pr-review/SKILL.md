---
name: pr-review
description: Review GitHub PRs or SourceHut patchsets with forge CLI tools, local checks, and concise actionable findings. Use when asked to review a PR, patch, branch, or merge request.
---

# PR / Patch Review

## Flow

1. Identify forge and branch with `repo_status` or `forge_status`.
2. Use `forge_pr_status` and `forge_ci_status` before reviewing.
3. If forge detection is unclear, use `/forge` or `forge_status`; pibarm asks once and remembers the choice.
4. Inspect the diff locally with `git diff`/`git show`.
5. Run the smallest relevant checks.
6. For GitHub PRs with an identifiable PR number/branch, post actionable findings as inline PR comments on changed lines when possible.
7. Report only actionable findings, with file paths.

## GitHub inline comments

When the forge is GitHub and a PR is linked to the current branch or supplied as `/review #123`:

1. Get PR metadata and head SHA:

```bash
gh pr view 123 --json number,url,headRefOid,headRefName,baseRefName,title
```

2. Inspect the patch:

```bash
gh pr diff 123
```

3. For each actionable finding that maps to a changed line, create an inline PR comment:

```bash
gh api --method POST repos/{owner}/{repo}/pulls/123/comments \
  -f body='Explain the issue and the smallest fix.' \
  -f commit_id='<headRefOid>' \
  -f path='path/to/file.ext' \
  -F line=123 \
  -f side=RIGHT
```

Guidelines:

- Comment only on correctness, tests, security, data/migration risk, or meaningful maintainability issues.
- Keep each PR comment concise and actionable.
- If a finding cannot be tied to a changed line, include it in the chat summary instead.
- If there are no actionable findings, do not add PR comments; say so in chat.
- For SourceHut/non-GitHub forges, report findings in chat with file paths and line references.

## Review lens

- correctness bugs
- missing tests for changed behavior
- migration/data/security risks
- over-engineering to delete/simplify
- CI failures and likely root cause

Prefer worktrees for checking out external branches or risky patch application.
