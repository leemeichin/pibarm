---
name: typescript
description: TypeScript and JavaScript development workflow. Use when editing TS/JS, package.json scripts, Node CLIs, React/Vite/Next apps, or pi TypeScript extensions.
---

# TypeScript

## Inspect first

- Read `package.json`, lockfile, `tsconfig*.json`, and nearby tests.
- Use the repo's package manager: prefer lockfile/script evidence over guessing.

## Common checks

Run the smallest relevant check:

```bash
npm run check
npm test
npm run lint
npx tsc --noEmit
pnpm test
bun test
```

For pi extensions, keep modules small and avoid runtime dependencies unless already installed.

## Style

- Reuse existing helpers and types.
- Prefer stdlib/platform APIs over new packages.
- Do not add broad config or factories for one use case.
