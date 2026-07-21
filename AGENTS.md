# Agent Instructions for pibarm

This repo manages local pi skills, extensions, prompts, and project config. Treat it as infrastructure for the user's coding-agent environment; prioritize safety, reversibility, and explicit approval.

## Default workflow

- Prefer `/plan <task>` for non-trivial changes.
- In plan mode, inspect only and ask questions before proposing execution.
- Prefer worktree execution for risky or parallel changes:
  - `/execute-plan worktree <name>`
  - `run_worktree_agent`
  - `create_git_worktree`
- Do not modify the active checkout when the user asks for worktree isolation.
- After worktree execution, summarize with `summarize_worktree_diff` before suggesting merge/cleanup.
- Specialized custom tools start deferred; use `search_tools` to enable the relevant forge, MCP, delegation, worktree, watcher, repository, or Butty group.

## Repo conventions

- Extensions live in `extensions/*.ts` and should be small, auditable pi extension modules.
- Skills live in `skills/<name>/SKILL.md` and should use progressive disclosure: brief top-level instructions, details only when useful.
- Prompt templates live in `prompts/*.md`.
- Project-local pi config/examples live under `.pi/`.
- Prefer examples (`*.example.json`) for shareable config; never commit real local config with tokens.

## Development rules

- Read pi docs before changing extension/resource behavior:
  - extensions: pi docs `docs/extensions.md`
  - skills: pi docs `docs/skills.md`
  - packages: pi docs `docs/packages.md`
  - models/presets: pi docs `docs/models.md`
- Keep active tools' `description`, `promptSnippet`, and `promptGuidelines` specific and operational. Deferred tools should rely on `description` and omit prompt metadata so additive loading preserves the prompt prefix.
- Avoid long-running background resources in extension factories; start session-scoped resources from events/commands/tools and clean them up on shutdown.
- Keep user-facing commands concise and documented in `README.md`.
- When adding tools or commands, update relevant skills and preset examples.
- Prefer `gh`/`hut` wrapper extensions for forge operations; never add API tokens to repo config.
- For Python, Ruby/Rails, and TypeScript/React/Vue/Vite work, load the matching skill and run the smallest relevant check.

## Command execution

- Prefer direct shell commands and standard Unix tools over embedded Python for filesystem, text, Git, and validation work.
- Make multi-step or mutating shell commands fail fast with `set -euo pipefail`; do not hide unexpected errors.
- Use Python only when shell would be brittle or unsafe, and keep snippets small and focused.

## Validation

Before committing when practical:

```bash
node -e "for (const f of ['package.json','.pi/settings.json','.pi/mcporter.example.json','.pi/agent-presets.example.json']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('json ok')"
git diff --check
```

If TypeScript dependencies are installed, also run:

```bash
bun run check
bun run test
```

## Security

- Do not introduce PII into committed files, generated artifacts, examples, logs, or summaries. Use obvious placeholders for data authored by the agent and inspect staged file diffs before committing. Preserve tool-managed repository metadata, including the configured Git author and committer; never replace or rewrite attribution for privacy sanitization.
- Do not commit `.pi/mcporter.json`, `.pi/agent-presets.json`, `.env*`, logs, session dumps, or generated MCP traffic containing secrets.
- Treat `mcporter list`, MCP server configs, and imported editor configs as potentially sensitive because transports may include env vars or command-line tokens.
- Prefer environment variable placeholders in examples, never literal credentials.
