---
name: typescript
description: TypeScript and JavaScript development workflow. Use when editing TS/JS, package scripts, Node/Bun CLIs, React/Next, Vue/Nuxt, Vite, frontend tests, or pi TypeScript extensions.
---

# TypeScript

## Inspect first

- Read the nearest `package.json`, `packageManager` field, lockfile, workspace config, `tsconfig*.json`, framework config, tests, and CI.
- Use the repository's package manager and scripts. Do not mix lockfiles, install missing tools implicitly, or update dependencies unless requested.
- Respect package/workspace boundaries and existing ESM/CommonJS, runtime, path-alias, generated-code, and formatting conventions.
- Trace callers and nearby tests before changing exported types, hooks, stores, plugins, or shared components.
- For ambiguous symbols or diagnostics, load deferred `code_intel` with `search_tools`; fall back to `rg`/`read` when unavailable.

## TypeScript and runtime

- Prefer narrowing `unknown` over introducing `any`, casts, or non-null assertions. Reuse inferred and generated types.
- Preserve runtime validation at network, storage, environment, and user-input boundaries; TypeScript types are not validation.
- Prefer platform APIs and existing dependencies. Do not add a package for a small helper.
- Keep Node/Bun/browser APIs on the correct side of the runtime boundary.
- For pi extensions, follow Pi lifecycle APIs, register small auditable tools, and clean up session-scoped resources on shutdown.

## React

- Preserve state ownership and component boundaries. Derive values during render; use effects only to synchronize external systems.
- Follow hook ordering and dependency rules; use functional state updates when based on previous state.
- Keep server/client component boundaries and data-loading patterns already used by the app.
- Preserve semantic HTML, labels, keyboard access, focus behavior, and stable list keys.

## Vue

- Follow the component's existing Composition or Options API and SFC conventions.
- Use `computed` for derived state and `watch` only for side effects; do not mutate props.
- Preserve `ref`/reactive unwrapping, emit contracts, slot APIs, and router/store patterns.
- Keep templates accessible and keys stable.

## Vite

- Preserve existing plugins, aliases, environment prefixes, and build targets.
- Treat `import.meta.env` values shipped to the client as public; never move secrets into client-prefixed variables.
- Do not use Node-only APIs in browser modules or bypass the configured test/build environment.

## Smallest relevant checks

Run existing scripts first and scope to the touched package/file when supported:

```bash
npm test -- path/to/test
npm run lint -- path/to/file
npm run typecheck
pnpm --filter <package> test
pnpm --filter <package> typecheck
bun test path/to/test
./node_modules/.bin/tsc --noEmit
```

Do not use an executor that auto-downloads an absent package. Expand to the workspace build only when local checks cannot cover the change.
