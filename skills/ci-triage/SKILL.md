---
name: ci-triage
description: Triage GitHub Actions or SourceHut CI/build failures. Use when asked why CI is failing, what checks ran, or how to fix a failed build.
---

# CI Triage

## Flow

1. Use `repo_status` for branch/PR/CI summary.
2. Use `github_ci_status` or `sourcehut_builds` for recent runs.
3. Fetch logs with the forge CLI if needed (`gh run view --log`, `hut builds ...`).
4. Identify the first real failure, not downstream noise.
5. Map failure to the smallest local reproduction command.
6. Suggest or make the minimal fix after approval.

## Notes

- Do not paste secrets from logs.
- Prefer one failing check command over full-suite reruns.
- If logs are huge, summarize the relevant failing step only.
