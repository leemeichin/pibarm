---
title: language intelligence
stage: design
status: draft
created: 2026-07-19
tags:
  - pibarm
  - runtime
  - design
  - lsp
hub: "[[pibarm runtime design]]"
---

# language intelligence

A bounded code-intelligence layer for agent navigation and diagnostics. This complements the progressive Python, Ruby, and TypeScript skills; it does not put framework instructions in every prompt or turn pibarm into an editor.

## One tool, existing servers

Expose one `code_intel` tool with operations such as `definition`, `references`, `hover`, `symbols`, and `diagnostics`. One schema is easier for the model to select than a tool per language or operation, and every result follows the bounded-payload rule.

The extension/runtime discovers language servers in this order:

1. an explicit trusted `pibarm.languageServers` entry
2. a workspace-local executable already declared by the project
3. a known executable on `PATH`
4. no server — return an actionable unavailable result and fall back to `rg`, `read`, and repository checks

It never downloads a server, installs a package, changes a lockfile, or executes a project-supplied command before project trust. Initial candidates are deliberately small: TypeScript/JavaScript, Vue, Python, and Ruby. A server definition is command + arguments + file extensions + root markers, not a language-specific implementation.

## Lifecycle

- Start a server lazily on the first matching `code_intel` call, keyed by repository root and server definition.
- Open only requested documents. Forward bounded `didOpen`/`didChange`/`didSave` notifications after pibarm read/edit/write operations when the server is live.
- Cache diagnostics by document version and return only the requested file or a bounded workspace summary.
- Stop child processes on session shutdown. If a server exits, report it and allow one clean restart on the next request; do not create a background restart loop.
- The future host owns the server pool so child agents in one repository can share it without each spawning a daemon.

## Tool contract

Inputs stay transport-neutral:

```json
{
  "operation": "definition",
  "path": "src/example.ts",
  "line": 12,
  "column": 8,
  "query": "optional symbol/workspace query",
  "limit": 50
}
```

Paths must resolve inside a trusted project or approved worktree. Results use project-relative paths, one-based positions at the agent boundary, a truncation marker, and server identity. Raw LSP payloads and logs do not enter model context.

The tool must degrade honestly: `available: false` with the attempted server names and the normal grep/read fallback. Absence of a server is not an error and never triggers installation.

## Runtime and client boundary

Code intelligence is an agent/runtime capability, not a new client protocol. The host advertises it in ACP capabilities under `_meta.pibarm.languageIntelligence`. First-party clients may use `_pibarm/language/diagnostics` for passive diagnostic display, but agent requests still go through the same `code_intel` tool and journal.

## Validation

- fake JSON-RPC language server fixture for initialize/open/definition/references/diagnostics/shutdown
- root-confinement and untrusted-command tests
- no-server fallback test proving no install or lockfile mutation
- bounded-result and stale-diagnostic tests
- one real smoke test per supported server when that executable is already present in CI; absence skips rather than downloads

## Issue seeds

- `code_intel` extension and bounded result schema
- trusted server discovery/configuration
- lazy LSP process manager with shutdown cleanup
- post-edit diagnostic refresh
- TypeScript/Vue, Python, and Ruby server definitions
- host-owned shared server pool and `_pibarm/language/diagnostics`

## Related

[[pibarm runtime design]] · [[runtime core and protocol]] · [[security, permissions and notifications]] · [[parity matrix]]
