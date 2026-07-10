Open a GitHub PR for the current branch.

Requirements:
- Preserve Markdown newlines by writing the body to a temp file and using `gh pr create --body-file "$tmp"`.
- Do not use inline `--body` for multiline content.
- Check whether a PR already exists first; edit it instead of creating a duplicate.
- Include Summary and Test plan sections unless the user provided a different template.
