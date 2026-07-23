import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { multiplexerCandidates, normalizeAgentPanesSettings, registerChildAgentRunner } from "../lib/agent-runner.js";

const originalEnvironment = {
  PATH: process.env.PATH,
  TMUX: process.env.TMUX,
  TMUX_PANE: process.env.TMUX_PANE,
  ZELLIJ_SESSION_NAME: process.env.ZELLIJ_SESSION_NAME,
  ZELLIJ_TEST_CLOSED: process.env.ZELLIJ_TEST_CLOSED,
  ZELLIJ_TEST_KILLED: process.env.ZELLIJ_TEST_KILLED,
};

afterEach(() => {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("automatic agent panes", () => {
  test("defaults delegation to an available detached multiplexer", () => {
    expect(normalizeAgentPanesSettings()).toEqual({
      enabled: true,
      include: ["subagent", "worktree"],
      multiplexer: "auto",
      outsideMultiplexer: "detached",
    });
  });

  test("honors disable, renderer choice, headless mode, and bounded agent types", () => {
    expect(
      normalizeAgentPanesSettings({
        enabled: false,
        include: ["subagent", "subagent", "invalid" as never],
        multiplexer: "zellij",
        outsideMultiplexer: "headless",
      }),
    ).toEqual({
      enabled: false,
      include: ["subagent"],
      multiplexer: "zellij",
      outsideMultiplexer: "headless",
    });
  });

  test("prefers the active multiplexer and preserves tmux as the detached default", () => {
    const policy = normalizeAgentPanesSettings();
    expect(multiplexerCandidates(policy, { ZELLIJ_SESSION_NAME: "work" })).toEqual(["zellij"]);
    expect(multiplexerCandidates(policy, { TMUX: "/tmp/tmux", TMUX_PANE: "%1" })).toEqual(["tmux"]);
    expect(multiplexerCandidates(policy, {})).toEqual(["tmux", "zellij"]);
    expect(multiplexerCandidates({ ...policy, multiplexer: "zellij" }, {})).toEqual(["zellij"]);
  });

  test("runs and cleans up an agent in a detached Zellij session", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "pibarm-zellij-"));
    const config = join(cwd, ".pi");
    const bin = join(cwd, "bin");
    const closed = join(cwd, "zellij-closed");
    const killed = join(cwd, "zellij-killed");
    await mkdir(config);
    await mkdir(bin);
    await writeFile(
      join(config, "settings.json"),
      JSON.stringify({
        pibarm: {
          agentPanes: { enabled: true, multiplexer: "zellij", outsideMultiplexer: "detached" },
        },
      }),
    );
    await writeFile(
      join(bin, "pi"),
      `#!/usr/bin/env bash\nprintf '%s\\n' '{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"zellij ok"}}'\nprintf '%s\\n' '{"type":"agent_end","messages":[]}'\n`,
    );
    await writeFile(
      join(bin, "zellij"),
      `#!/usr/bin/env bash
set -e
if [[ "$1" == "--version" ]]; then echo 'zellij 1.0.0'; exit; fi
if [[ "$1 $2 $3" == "action new-pane --help" ]]; then echo --close-on-exit; exit; fi
if [[ "$1 $2 $3" == "action close-pane --help" ]]; then echo --pane-id; exit; fi
if [[ "$1 $2 $3" == "action focus-pane-id --help" ]]; then exit; fi
if [[ "$1" == "attach" ]]; then exit; fi
if [[ "$1" == "kill-session" ]]; then : >"$ZELLIJ_TEST_KILLED"; exit; fi
if [[ "$1" == "--session" ]]; then
  shift 3
  if [[ "$1" == "new-pane" ]]; then
    while [[ "$1" != "--" ]]; do shift; done
    shift
    "$@" >/dev/null 2>&1 &
    echo terminal_7
    exit
  fi
  if [[ "$1" == "close-pane" ]]; then : >"$ZELLIJ_TEST_CLOSED"; exit; fi
  exit
fi
exit 1
`,
    );
    await chmod(join(bin, "pi"), 0o755);
    await chmod(join(bin, "zellij"), 0o755);
    process.env.PATH = `${bin}:${process.env.PATH}`;
    delete process.env.TMUX;
    delete process.env.TMUX_PANE;
    delete process.env.ZELLIJ_SESSION_NAME;
    process.env.ZELLIJ_TEST_CLOSED = closed;
    process.env.ZELLIJ_TEST_KILLED = killed;

    const handlers = new Map<string, () => Promise<void>>();
    const pi = {
      registerCommand() {},
      on(name: string, handler: () => Promise<void>) {
        handlers.set(name, handler);
      },
      async exec(command: string, args: string[], options: { cwd?: string } = {}) {
        const child = Bun.spawn([command, ...args], {
          cwd: options.cwd,
          env: process.env,
          stdout: "pipe",
          stderr: "pipe",
        });
        const [stdout, stderr, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        return { stdout, stderr, code };
      },
    };
    const ctx = {
      cwd,
      hasUI: false,
      mode: "print",
      isProjectTrusted: () => true,
      sessionManager: { getSessionId: () => "zellij-session" },
      ui: { notify() {} },
    };

    const result = await registerChildAgentRunner(pi as never).run(
      { id: "zellij-agent", prompt: "ignored", kind: "subagent", cwd, timeoutMs: 10_000 },
      ctx as never,
    );
    expect(result.renderer).toBe("zellij");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("zellij ok");
    expect(result.attachCommand).toStartWith("zellij attach pibarm-");
    expect(await readFile(closed, "utf8")).toBe("");

    await handlers.get("session_shutdown")?.();
    expect(await readFile(killed, "utf8")).toBe("");
  });
});
