# Security Policy

This repo configures and extends a local pi coding-agent setup. Extensions run with local user permissions, and skills can instruct agents to run commands, so review changes as you would shell scripts.

## Sensitive files

Do not commit real local config or credentials:

- `.pi/mcporter.json`
- `.pi/agent-presets.json`
- `.env`, `.env.*`
- logs/session transcripts containing tool output
- MCP recordings or generated config that include tokens

Use checked-in examples instead:

- `.pi/mcporter.example.json`
- `.pi/agent-presets.example.json`

## Before pushing

Run a quick secret scan:

```bash
git grep -n -I -E 'token|secret|password|Bearer|ghp_|sk-|HONEYBADGER|ANTHROPIC_API_KEY|OPENAI_API_KEY|GEMINI_API_KEY'
```

Also check committed history if you suspect a secret was committed:

```bash
git grep -n -I -E 'token|secret|password|Bearer|ghp_|sk-' $(git rev-list --all)
```

If a real secret was committed, rotate the secret first, then rewrite history before pushing.

## Extension safety expectations

- Keep extensions auditable and minimal.
- Avoid automatic destructive behavior.
- Gate cleanup/removal actions behind user confirmation where possible.
- Prefer worktree execution for risky changes.
- Do not expose secret-bearing command output in README examples, skills, or committed test fixtures.
