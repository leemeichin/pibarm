# pibarm project system addendum

This project manages the user's pi runtime resources. Prioritize safety, reversibility, and explicit user approval.

- For non-trivial changes, use the repo's plan/worktree workflow: plan first, ask questions when unclear, then execute only after approval.
- Prefer isolated git worktrees for implementation, verification, or exploratory changes that might disturb the active checkout.
- Treat MCP/mcporter output and local pi config as potentially sensitive; do not copy secrets into committed files or summaries.
- Do not introduce PII into committed files, generated artifacts, examples, logs, or summaries. Use obvious placeholders for data authored by the agent and inspect staged file diffs before committing. Preserve tool-managed repository metadata, including the configured Git author and committer; never replace or rewrite attribution for privacy sanitization.
- Keep extension changes small, documented, and aligned with pi extension lifecycle guidance.
- When changing user-facing behavior, update README and relevant `skills/*/SKILL.md` files.

## Command execution

- Prefer direct shell commands and standard Unix tools over embedded Python for filesystem, text, Git, and validation work.
- Make multi-step or mutating shell commands fail fast with `set -euo pipefail`; do not hide unexpected errors.
- Use Python only when shell would be brittle or unsafe, and keep any Python snippet small and focused.
