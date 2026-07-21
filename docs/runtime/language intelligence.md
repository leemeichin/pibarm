---
title: language intelligence
stage: design
status: implemented
created: 2026-07-19
tags:
  - pibarm
  - runtime
  - design
  - lsp
hub: "[[pibarm runtime design]]"
---

# language intelligence

A bounded semantic-navigation and diagnostics layer. It complements progressive language skills without turning pibarm into an editor or adding language-specific instructions to every prompt.

## Reuse an existing manager

Pibarm delegates language-server discovery, installation, multi-language project management, JSON-RPC, indexing, and diagnostics to pinned [Serena](https://github.com/oraios/serena) 1.6.1. Serena's SolidLSP layer supports more than 40 languages, including TypeScript/JavaScript, Vue, Python, and Ruby.

The alternatives reviewed were narrower or unsafe for this boundary:

- Microsoft MultiLSPy has a useful common client API, but is pre-alpha, lacks Vue, discards pushed diagnostics in its high-level adapters, invokes some installers through a shell, and installs Solargraph into the active Ruby environment.
- `lsp-mux/lsp-proxy` multiplexes child servers well, but its registry currently covers only three JavaScript-oriented servers and does not install them.
- Mason is coupled to Neovim.
- `mcp-language-server` exposes one preinstalled server at a time.

Serena is larger than a client library, but reusing its read-only MCP tools avoids owning another LSP client, downloader, server registry, and multi-language process manager. Pibarm exposes only one deferred adapter tool rather than Serena's broader editing and memory surface.

## Tool contract

`code_intel` supports:

```json
{
  "operation": "definition",
  "path": "src/example.ts",
  "line": 12,
  "column": 8,
  "query": "optional symbol or name path",
  "limit": 50
}
```

Operations are `definition`, `references`, `hover`, `symbols`, and `diagnostics`. Paths are project-relative and positions are one-based. When `query` is omitted, pibarm extracts the identifier at the requested position and maps the request to Serena's `find_symbol`, `find_referencing_symbols`, `get_symbols_overview`, or `get_diagnostics_for_file` tool.

Results are capped at 20,000 characters and identify Serena as the manager. Raw LSP traffic does not enter model context. Unavailability is a normal result so the agent can fall back to `rg`, `read`, and repository checks.

## Acquisition and isolation

The first trusted call:

1. prefers an existing `uvx` or `uv`
2. otherwise uses existing `mise` to install pinned `uv` 0.11.30
3. runs Serena 1.6.1 from its SHA-256-pinned wheel through `mcporter`
4. lets Serena detect all applicable project languages and acquire its pinned servers

Runtime, Python, server, index, log, and configuration data live under a repository-keyed directory in the Pi agent cache. `SERENA_HOME`, uv directories, mise directories, and Serena's per-project data location all point there. A filesystem lock and Pi's sequential tool execution prevent concurrent calls from racing the same installer/configuration. Neither project dependencies nor global Python/Ruby/npm state are changed.

Language toolchains needed by a server remain host prerequisites: for example, Ruby LSP requires Ruby. When Ruby is already installed through mise, pibarm selects that installed version without changing mise configuration. Pibarm acquires the language server and its Python/Node dependencies, not arbitrary project compilers or SDKs.

The enforced Serena wheel for 1.6.1 is `serena_agent-1.6.1-py3-none-any.whl`, SHA-256 `04ddd985bd3feb25598ab8732bf3a998f961d5b46dce271b816126c0a68a91e1`. uv and Serena retain their own lock/version metadata for transitive packages and server artifacts.

`PI_OFFLINE=1` and `pibarm.codeIntel.autoInstall=false` disable acquisition. Calls proceed only after that file type has completed an online query, and uv, pip, npm, and subprocess proxy settings are forced offline so a partially deleted cache fails closed instead of reacquiring artifacts. `pibarm.codeIntel.enabled=false` disables the adapter.

## Security boundary

- Project trust is required before reading project settings or starting Serena.
- Requested paths are resolved through the filesystem and must remain inside the real project root, including through symlinks.
- Every subprocess receives an argument array; no project string is interpolated into shell syntax.
- Serena's dashboard and GUI are disabled.
- Its home and project-data template are rewritten into the isolated cache before each run.
- Timeouts and bounded model-facing output apply to cold downloads as well as warm queries.
- Config, logs, indexes, and MCP traffic remain local and uncommitted.

## Lifecycle

The current extension uses mcporter's stdio lifecycle for each request while Serena persists indexes and downloaded servers in the isolated cache. This favors a small auditable adapter over another process pool. The future runtime host may keep the Serena MCP server warm and share it across child agents after measurements show startup latency warrants that complexity.

## Runtime and client boundary

Code intelligence is an agent/runtime capability, not a new client protocol. The future host advertises it under ACP `_meta.pibarm.languageIntelligence`; first-party clients may later receive passive diagnostics through `_pibarm/language/diagnostics`. Agent requests continue through the same journaled `code_intel` tool.

## Validation

- operation-to-Serena mapping and identifier extraction tests
- untrusted-project rejection before process execution
- realpath confinement, offline, no-runtime, and bounded-output integration checks
- disposable TypeScript, Vue, Python, and Ruby behavioral scenarios
- cold acquisition timing recorded separately from warm agent-task timing

## Related

[[pibarm runtime design]] · [[runtime core and protocol]] · [[security, permissions and notifications]] · [[parity matrix]]
