---
name: ci-triage
description: Triage GitHub Actions or SourceHut CI/build failures. Use when asked why CI is failing, what checks ran, or how to fix a failed build.
---

# CI Triage

Enable the repository and forge tools with `search_tools` if they are inactive.

## Flow

1. Use `repo_status` for branch/PR/CI summary.
2. Use `forge_ci_status` for recent runs/builds.
3. If forge detection is unclear, use `/forge` or `forge_status`; pibarm asks once and remembers the choice.
4. Fetch logs with the forge CLI if needed (`gh run view --log`, `hut builds ...`).
5. Identify the first real failure, not downstream noise.
6. Map failure to the smallest local reproduction command.
7. Suggest or make the minimal fix after approval.

## Notes

- Do not paste secrets from logs.
- Prefer one failing check command over full-suite reruns.
- If logs are huge, summarize the relevant failing step only.
