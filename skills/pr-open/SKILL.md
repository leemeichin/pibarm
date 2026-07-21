---
name: pr-open
description: Open GitHub pull requests with newline-safe bodies. Use when asked to create, open, draft, or update a PR description/body.
---

# PR Open

Use `gh pr create` with `--body-file`, not inline `--body`, so Markdown newlines survive. Enable repository and watcher tools with `search_tools` if they are inactive.

## Flow

1. Check branch/status with `git status --short --branch` and `repo_status` when available.
2. Get or infer title, base branch, draft state, and body content.
3. Write the PR body to a temp file with a quoted heredoc.
4. Run `gh pr create --title ... --body-file "$tmp"`.
5. Print the PR URL.
6. Immediately start `watch_agent` for that PR without asking, including drafts, so CI and review changes feed back into the parent session.

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
- Always start the watcher after creating or updating the PR. GitHub uses PR/check status; SourceHut uses forge-native builds; unsupported forges need an explicit `watchCommand`.
