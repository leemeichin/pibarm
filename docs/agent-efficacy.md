# Agent efficacy

This is the evidence log for changes intended to improve pibarm's task success, latency, context use, and reliability. “Optimal” is not a static target: changes need a baseline, a reason, and a check that can falsify the reason.

## Baseline

Run the deterministic prompt audit without making a model request:

```bash
bun run audit:prompt
```

Baseline on Pi 0.81.0 before the foundation changes:

| Measure                                  |                                     Value |
| ---------------------------------------- | ----------------------------------------: |
| Built system prompt in a nested worktree |         17,352 characters (~4,338 tokens) |
| Project context in that worktree         | 5,410 characters across 2 identical files |
| Duplicate worktree context               |                          2,705 characters |
| Appended system prompt                   |                          1,379 characters |
| Registered/active custom tools           |                                   25 / 25 |
| Active custom-tool schemas               |                          9,515 characters |
| Active tool prompt metadata              |                          4,032 characters |
| Skill catalog                            |               10 skills, 1,698 characters |

The token count is a character-based estimate. Tool schemas are reported separately because providers serialize them outside the system-prompt string. A normal checkout has one 2,705-character project context file; a worktree under `.pi/wt/` also discovers the parent checkout's identical `AGENTS.md`. The audit reports raw and duplicate context so this cost stays visible.

At the Foundation checkpoint, the same audit builds 10,993 characters (~2,749 tokens), 37% below baseline. It registers 26 custom tools but starts with 4 active; active schemas fall to 3,211 characters (66% lower) and active prompt metadata to 932 characters (77% lower). `AGENTS.md` is the single always-on policy source, appended prompt text is zero, and worktree context filtering keeps 1 of the 2 discovered instruction files. Deferred tool groups are added rather than swapped so supported providers can preserve the prompt prefix.

The repository has good extension-level tests, but no behavioral suite that measures whether an agent solves representative tasks. Prompt-size improvements are therefore measured; task-success improvements remain hypotheses until a repeatable behavioral suite exists.

## Observed issues

1. `AGENTS.md` and `.pi/APPEND_SYSTEM.md` repeat workflow, security, and shell guidance in always-on context.
2. Every custom tool starts active, even when a task has no forge, MCP, worktree, subagent, or visible-pane work. This spends context and expands tool choice.
3. The example executor preset names a tool that does not exist and omits the join tool needed after visible delegation.
4. Plan-mode bash filtering recognizes command names but not side-effecting forms such as `find -exec` or `awk`'s `system()`.
5. Rich planning questions become untyped text inputs outside the TUI, so the current RPC path cannot provide web/desktop parity.
6. Language guidance covers Ruby and TypeScript only; there is no code-intelligence layer or Python workflow.
7. Runtime design notes still treat Pi's embedding surface as uncertain even though Pi now documents `AgentSessionRuntime`, SDK events, RPC UI requests, and session replacement.
8. Repo-nested worktree agents load the same root instructions twice because Pi discovers context files in both the worktree and its parent checkout.

## Source review

Sources are pinned here so later reviews can distinguish an upstream change from a changed interpretation.

| Source                                                                                | Revision reviewed | Useful pattern                                                                                            |
| ------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| [Pi](https://github.com/earendil-works/pi/tree/v0.81.0/packages/coding-agent)         | 0.81.0            | Progressive skills, dynamic tool activation, documented SDK/RPC runtime, nested usage accounting          |
| [Codex CLI](https://github.com/openai/codex)                                          | `40a7192`         | Concise core instructions, bounded model context, hierarchical project instructions, deferred tool search |
| [OpenCode](https://github.com/anomalyco/opencode)                                     | `cb562b2`         | Model-aware prompts, lazy skills, one LSP tool, lazy server startup, post-edit diagnostics                |
| [Claude Code](https://github.com/anthropics/claude-code)                              | `4d07874`         | Progressive plugin skills, scoped project instructions, LSP plugins, prompt-trimming doctor guidance      |
| [Serena](https://github.com/oraios/serena)                                            | `2c10e25`         | Multi-language SolidLSP manager, isolated acquisition, diagnostics, and bounded semantic MCP tools        |
| [Agent Client Protocol](https://github.com/agentclientprotocol/agent-client-protocol) | `879fc80`         | Standard sessions, plans, tools, permissions, capability negotiation, and namespaced extensions           |

The Claude Code repository exposes plugins and release information, not its proprietary core system prompt. No conclusion here assumes access to that prompt.

## Decisions

- Keep one always-on project instruction source. Put task-specific detail in skills and tool descriptions.
- Prefer Pi's additive lazy-tool mechanism over adding another dispatcher protocol. Keep safety and planning tools active; load specialized groups when needed.
- Keep language/framework knowledge in focused skills. Do not inject Rails, React, Vue, Vite, or Python guidance into every task.
- Start language intelligence lazily through one deferred tool. In trusted projects it may acquire pinned Serena/runtime/server artifacts into an isolated Pi cache, never project or global package state.
- Reuse Serena's multi-language SolidLSP manager rather than maintain another LSP client, downloader, and server registry. Keep its broader editing and memory tools outside pibarm's model surface.
- Surface bounded semantic navigation and diagnostics through one tool rather than one tool per language or operation.
- Embed Pi through its SDK in the future host. Treat ACP as an interoperability boundary, with namespaced pibarm extensions for worktrees, child agents, watchers, forge state, and journal replay.
- Keep the journal as the durable replay source; neither ACP v1 nor a WebSocket connection alone guarantees missed-event recovery.
- Treat Tailscale, SSH forwarding, and WebSocket as transport/security choices, not agent-protocol semantics.

## Measurement ladder

1. **Static:** prompt characters, tool-schema characters, active tool count, extension load errors.
2. **Deterministic:** unit/integration checks for routing, safety policy, state restoration, and protocol mapping.
3. **Behavioral:** fixed tasks in disposable repositories, scored by tests plus duration, tool calls, input/output/cache tokens, and cost.
4. **Operational:** real-session regressions such as timeouts, failed joins, stale task state, and cache misses.

Do not tune prompts from anecdotes alone. Add a failing case first when a regression can be reproduced.

## Behavioral harness

Run one bounded pass of four disposable TypeScript, Vue, Python, and Ruby tasks with an explicit model:

```bash
bun run eval:agent --model=<provider/model> --variant=baseline
bun run eval:agent --model=<provider/model> --variant=code-intel
```

`--runs=1` is the default and `--runs=2` is the hard cap, limiting each invocation to eight model requests. Both variants receive identical prompts and built-in tools; the comparison additionally registers deferred `code_intel`. Raw JSON events and logs remain ignored under `.pi/evals/`. The committed harness writes only a sanitized aggregate containing scenario name, runnable success, wall time, tool calls, token classes, and reported cost.

Record cold Serena/runtime/server acquisition separately from warm task behavior. Four samples support regression detection, not statistical claims. A comparison is acceptable only when runnable success does not regress and the prompt audit shows that the deferred tool did not grow the initial active schema surface.

### First recorded pass

Model: `openai-codex/gpt-5.4-mini`, one run per scenario.

| Variant                 | Runnable success | Duration | Tool calls | `code_intel` calls | Input / output / cache-read tokens | Reported cost |
| ----------------------- | ---------------: | -------: | ---------: | -----------------: | ---------------------------------: | ------------: |
| Foundation baseline     |              4/4 |   280.7s |         64 |                  0 |          29,505 / 12,766 / 176,640 |       $0.0928 |
| Cold managed code-intel |              4/4 |   453.0s |         67 |                 12 |          30,895 / 13,207 / 171,008 |       $0.0954 |

The baseline agents fixed all four fixtures; the first report marked Python and Ruby verification failed because the harness invoked unavailable unversioned runtime commands. Re-running those unchanged fixtures with the detected Nix/mise runtimes passed, and runtime detection is now part of the harness.

The cold comparison preserved task success but was 61% slower and does **not** establish an efficacy or performance improvement. It exposed concurrent first-install races and missing uv/Ruby environment propagation; those are now covered by serialization/offline tests and direct TypeScript, Vue, Python, and Ruby smoke checks. `code_intel` therefore remains deferred, and a future warm-server/process-pool change needs a new identical comparison before any speed claim.

## Staying current with Pi

Development uses an exact Pi version for reproducible CI. `bun run check:pi-latest` compares that pin with npm. The scheduled `Latest Pi compatibility` workflow installs npm `latest` in an ephemeral runner, executes the full root validation, and fails when the repository pin needs review.

For each pin update:

1. Read the release notes and changed extension, SDK, RPC, skills, packages, and model documentation.
2. Run the prompt audit and full validation.
3. Record architecture-relevant changes here; do not copy the whole upstream changelog.
