# pibarm project system addendum

This project manages the user's pi runtime resources. Prioritize safety, reversibility, and explicit user approval.

- For non-trivial changes, use the repo's plan/worktree workflow: plan first, ask questions when unclear, then execute only after approval.
- Prefer isolated git worktrees for implementation, verification, or exploratory changes that might disturb the active checkout.
- Treat MCP/mcporter output and local pi config as potentially sensitive; do not copy secrets into committed files or summaries.
- Keep extension changes small, documented, and aligned with pi extension lifecycle guidance.
- When changing user-facing behavior, update README and relevant `skills/*/SKILL.md` files.
