import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import buttyExtension, { routeSubagentsToButty } from "../extensions/butty.js";

const tools = new Map<string, any>();
const calls: Array<{ command: string; args: string[] }> = [];
const statusKeys: string[] = [];
let cwd = "";
let previousPane: string | undefined;
let nextPane = 11;
let approveOverflow = true;
let confirmations = 0;
let livePanes: Array<{ pane_id: number; tab_id: number; window_id: number; workspace: string }> = [];

beforeEach(async () => {
  tools.clear();
  calls.length = 0;
  statusKeys.length = 0;
  cwd = await mkdtemp(join(tmpdir(), "butty-test-"));
  previousPane = process.env.WEZTERM_PANE;
  process.env.WEZTERM_PANE = "7";
  nextPane = 11;
  approveOverflow = true;
  confirmations = 0;
  livePanes = [{ pane_id: 7, tab_id: 1, window_id: 1, workspace: "project" }];
});

afterEach(async () => {
  if (previousPane === undefined) delete process.env.WEZTERM_PANE;
  else process.env.WEZTERM_PANE = previousPane;
  await rm(cwd, { recursive: true, force: true });
});

function setup() {
  const pi = {
    registerTool(tool: any) {
      tools.set(tool.name, tool);
    },
    registerCommand() {},
    on() {},
    async exec(command: string, args: string[]) {
      calls.push({ command, args });
      if (command === "git") return { code: 1, stdout: "", stderr: "" };
      const action = args[1];
      if (action === "list") return { code: 0, stdout: JSON.stringify(livePanes), stderr: "" };
      if (action === "split-pane") {
        const targetId = Number(args[args.indexOf("--pane-id") + 1]);
        const target = livePanes.find((pane) => pane.pane_id === targetId)!;
        const pane = { ...target, pane_id: nextPane++ };
        livePanes.push(pane);
        return { code: 0, stdout: `${pane.pane_id}\n`, stderr: "" };
      }
      if (action === "spawn") {
        const pane = { pane_id: nextPane++, tab_id: nextPane, window_id: 2, workspace: "project" };
        livePanes.push(pane);
        return { code: 0, stdout: `${pane.pane_id}\n`, stderr: "" };
      }
      if (action === "kill-pane") {
        const paneId = Number(args[args.indexOf("--pane-id") + 1]);
        livePanes = livePanes.filter((pane) => pane.pane_id !== paneId);
      }
      return { code: 0, stdout: "", stderr: "" };
    },
  };
  const ctx = {
    cwd,
    mode: "tui",
    hasUI: true,
    model: undefined,
    modelRegistry: { getAvailable: () => [] },
    sessionManager: { getSessionId: () => "session" },
    ui: {
      setStatus(key: string) {
        statusKeys.push(key);
      },
      setWidget() {},
      async confirm() {
        confirmations++;
        return approveOverflow;
      },
    },
  };
  buttyExtension(pi as never);
  return ctx;
}

async function spawn(role: string, ctx: ReturnType<typeof setup>) {
  return tools.get("butty_spawn").execute("spawn", { role, task: "inspect code" }, undefined, undefined, ctx);
}

describe("Butty workspace targeting", () => {
  test("serializes agents into a bottom row and never kills the parent", async () => {
    const ctx = setup();

    await Promise.all([spawn("scout", ctx), spawn("planner", ctx), spawn("reviewer", ctx)]);

    const splits = calls.filter(({ args }) => args[1] === "split-pane");
    expect(
      splits.map(({ args }) => [args[args.indexOf("--pane-id") + 1], args.includes("--bottom") ? "bottom" : "right"]),
    ).toEqual([
      ["7", "bottom"],
      ["11", "right"],
      ["12", "right"],
    ]);
    expect(calls.some(({ args }) => args.includes("--new-window"))).toBe(false);
    expect(calls.filter(({ args }) => args.includes("activate-pane") && args.includes("7"))).toHaveLength(3);

    await tools.get("butty_kill").execute("kill", {}, undefined, undefined, ctx);

    expect(calls.some(({ args }) => args.includes("kill-pane") && args.includes("7"))).toBe(false);
    expect(statusKeys).not.toContain("butty");
    expect(splits[0]?.args.at(-1)).toContain("'node'");
  });

  test("keeps three agents when the overflow window is declined", async () => {
    const ctx = setup();
    await Promise.all([spawn("scout", ctx), spawn("planner", ctx), spawn("reviewer", ctx)]);
    approveOverflow = false;

    await expect(spawn("worker", ctx)).rejects.toThrow("spawn cancelled");

    expect(confirmations).toBe(1);
    expect(calls.some(({ args }) => args.includes("--new-window"))).toBe(false);
  });

  test("moves the fourth and later agents to a new window after approval", async () => {
    const ctx = setup();
    await Promise.all([spawn("scout", ctx), spawn("planner", ctx), spawn("reviewer", ctx)]);

    await spawn("worker", ctx);
    await spawn("verifier", ctx);

    const newWindow = calls.find(({ args }) => args[1] === "spawn" && args.includes("--new-window"));
    const overflowSplit = calls.find(
      ({ args }) => args[1] === "split-pane" && args.includes("--pane-id") && args.includes("14"),
    );
    expect(confirmations).toBe(1);
    expect(newWindow).toBeDefined();
    expect(overflowSplit?.args).toContain("--right");
  });

  test("requires interactive approval before overflowing", async () => {
    const ctx = setup();
    await Promise.all([spawn("scout", ctx), spawn("planner", ctx), spawn("reviewer", ctx)]);
    ctx.hasUI = false;

    await expect(spawn("worker", ctx)).rejects.toThrow("requires confirmation");
  });
});

describe("automatic Butty routing", () => {
  test("replaces only headless subagent tools", () => {
    expect(
      routeSubagentsToButty(["read", "run_subagent", "run_subagents", "run_worktree_agent", "watch_agent"]),
    ).toEqual([
      "read",
      "run_worktree_agent",
      "watch_agent",
      "butty_spawn",
      "butty_capture",
      "butty_join",
      "butty_list",
      "butty_kill",
    ]);
  });
});
