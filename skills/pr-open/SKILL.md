---
name: pr-open
description: Open GitHub pull requests with newline-safe bodies. Use when asked to create, open, draft, or update a PR description/body.
---

# PR Open

Use `gh pr create` with `--body-file`, not inline `--body`, so Markdown newlines survive.

## Flow

1. Check branch/status with `git status --short --branch` and `repo_status` when available.
2. Get or infer title, base branch, draft state, and body content.
3. Write the PR body to a temp file with a quoted heredoc.
4. Run `gh pr create --title ... --body-file "$tmp"`.
5. Print the PR URL.

## Body pattern

```bash
tmp=$(mktemp)
cat > "$tmp" <<'EOF'
## Summary
- ...

## Test plan
- ...
EOF

gh pr create --title "..." --body-file "$tmp"
```

Rules:
- Never pass multiline Markdown through `--body "...\n..."`.
- Use `--draft` if the user asks for draft or checks are unfinished.
- If a PR already exists for the branch, use `gh pr edit --body-file "$tmp"` instead of creating a duplicate.
