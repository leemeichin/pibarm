# pibarm project system addendum

This project manages the user's pi runtime resources. Prioritize safety, reversibility, and explicit user approval.

- For non-trivial changes, use the repo's plan/worktree workflow: plan first, ask questions when unclear, then execute only after approval.
- Prefer isolated git worktrees for implementation, verification, or exploratory changes that might disturb the active checkout.
- Treat MCP/mcporter output and local pi config as potentially sensitive; do not copy secrets into committed files or summaries.
- PII is completely disallowed in commits. Never commit names, personal email addresses, phone numbers, home addresses, local filesystem paths containing user identifiers, or other identifying data; use obvious placeholders instead and inspect the staged diff before every commit.
- Keep extension changes small, documented, and aligned with pi extension lifecycle guidance.
- When changing user-facing behavior, update README and relevant `skills/*/SKILL.md` files.
