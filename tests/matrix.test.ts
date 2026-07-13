import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import matrixExtension, { routeSubagentsToMatrix } from "../extensions/matrix.js";

const tools = new Map<string, any>();
const calls: Array<{ command: string; args: string[] }> = [];
const statusKeys: string[] = [];
let cwd = "";
let previousPane: string | undefined;

beforeEach(async () => {
  tools.clear();
  calls.length = 0;
  statusKeys.length = 0;
  cwd = await mkdtemp(join(tmpdir(), "matrix-test-"));
  previousPane = process.env.WEZTERM_PANE;
  process.env.WEZTERM_PANE = "7";
});

afterEach(async () => {
  if (previousPane === undefined) delete process.env.WEZTERM_PANE;
  else process.env.WEZTERM_PANE = previousPane;
  await rm(cwd, { recursive: true, force: true });
});

describe("Matrix workspace targeting", () => {
  test("splits the parent pane and never kills it", async () => {
    const pi = {
      registerTool(tool: any) {
        tools.set(tool.name, tool);
      },
      registerCommand() {},
      on() {},
      async exec(command: string, args: string[]) {
        calls.push({ command, args });
        if (command === "git") return { code: 1, stdout: "", stderr: "" };
        if (args.includes("list")) {
          return {
            code: 0,
            stdout: JSON.stringify([{ pane_id: 7, tab_id: 1, window_id: 1, workspace: "project" }]),
            stderr: "",
          };
        }
        if (args.includes("split-pane")) return { code: 0, stdout: "11\n", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      },
    };
    const ctx = {
      cwd,
      mode: "json",
      model: undefined,
      modelRegistry: { getAvailable: () => [] },
      sessionManager: { getSessionId: () => "session" },
      ui: {
        setStatus(key: string) {
          statusKeys.push(key);
        },
        setWidget() {},
      },
    };
    matrixExtension(pi as never);

    await tools
      .get("matrix_spawn")
      .execute("spawn", { role: "scout", task: "inspect code" }, undefined, undefined, ctx);
    await tools.get("matrix_kill").execute("kill", {}, undefined, undefined, ctx);

    expect(calls.some(({ args }) => args.includes("--prefer-mux"))).toBe(false);
    expect(calls).toContainEqual(
      expect.objectContaining({
        command: "wezterm",
        args: expect.arrayContaining(["cli", "split-pane", "--pane-id", "7", "--right"]),
      }),
    );
    expect(calls.some(({ args }) => args.includes("--new-window"))).toBe(false);
    expect(calls.some(({ args }) => args.includes("activate-pane") && args.includes("7"))).toBe(true);
    expect(calls.some(({ args }) => args.includes("set-tab-title"))).toBe(false);
    expect(calls.some(({ args }) => args.includes("kill-pane") && args.includes("11"))).toBe(true);
    expect(calls.some(({ args }) => args.includes("kill-pane") && args.includes("7"))).toBe(false);
    expect(statusKeys).not.toContain("matrix");

    const split = calls.find(({ args }) => args.includes("split-pane"));
    expect(split?.args.at(-1)).toContain("'node'");
    expect(calls.findIndex(({ args }) => args.includes("activate-pane"))).toBe(
      calls.findIndex(({ args }) => args.includes("split-pane")) + 1,
    );
  });
});

describe("automatic Matrix routing", () => {
  test("replaces only headless subagent tools", () => {
    expect(
      routeSubagentsToMatrix(["read", "run_subagent", "run_subagents", "run_worktree_agent", "watch_agent"]),
    ).toEqual([
      "read",
      "run_worktree_agent",
      "watch_agent",
      "matrix_spawn",
      "matrix_capture",
      "matrix_join",
      "matrix_list",
      "matrix_kill",
    ]);
  });
});
