import { mkdir } from "node:fs/promises";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { join } from "node:path";

const WORKSPACE = "matrix";

const SPAWN_PARAMS = Type.Object({
  role: Type.String({ description: "Agent role/name, e.g. scout, planner, worker, reviewer" }),
  task: Type.String({ description: "Task or prompt for the agent" }),
  model: Type.Optional(Type.String({ description: "Optional pi model, e.g. anthropic/claude-haiku-4-5" })),
  tools: Type.Optional(Type.Array(Type.String(), { description: "Optional tool allowlist for the agent" })),
  worktree: Type.Optional(Type.Boolean({ description: "Run in a new git worktree when this agent needs an isolated branch" })),
  placement: Type.Optional(Type.String({ description: "Where to open it: right, down, tab, or window. Defaults to right split after the first window." })),
});

const SEND_PARAMS = Type.Object({
  role: Type.String({ description: "Agent role/name" }),
  message: Type.String({ description: "Message to send to that WezTerm pane" }),
});

const CAPTURE_PARAMS = Type.Object({
  role: Type.Optional(Type.String({ description: "Agent role/name. Omit to capture all known agents" })),
  lines: Type.Optional(Type.Number({ description: "Number of recent pane lines to capture. Defaults to 80" })),
});

const KILL_PARAMS = Type.Object({
  role: Type.Optional(Type.String({ description: "Agent role/name. Omit or use all to kill known Matrix panes" })),
});

const ATTACH_PARAMS = Type.Object({});

const ROLE_DEFAULTS: Record<string, { model: string; tools?: string[] }> = {
  scout: { model: "anthropic/claude-haiku-4-5", tools: ["read", "grep", "find", "ls", "bash"] },
  planner: { model: "anthropic/claude-sonnet-4-5", tools: ["read", "grep", "find", "ls", "question", "elicit_plan_questions"] },
  worker: { model: "anthropic/claude-sonnet-4-5" },
  reviewer: { model: "anthropic/claude-sonnet-4-5", tools: ["read", "grep", "find", "ls", "bash"] },
};

type Placement = "right" | "down" | "tab" | "window";
type AgentPane = { role: string; pane: string; cwd: string; model: string; tools?: string[]; worktree?: string; placement: Placement };

const MATRIX_HELP = `Matrix is a WezTerm-native cockpit for visible parent-controlled agents.

When to use it:
- use Matrix when you want to watch/steer agents in WezTerm tabs or splits
- use run_subagent/run_subagents for headless one-shot checks
- use worktrees for separate branch/risky worker changes
- use the current checkout for same-branch distributed work

Common flow:
1. /matrix-attach
2. /matrix-spawn scout map the relevant code
3. /matrix-spawn planner propose a small safe plan
4. /matrix-capture
5. /matrix-spawn worker implement the approved plan
6. /matrix-kill all

Commands:
/matrix <task>                 start scout + planner
/matrix-attach                 open a WezTerm Matrix workspace window
/matrix-spawn <role> <task>    spawn scout/planner/worker/reviewer
/matrix-send <role> <message>  steer a pane
/matrix-capture [role]         read recent pane output
/matrix-kill [role|all]        clean up known panes`;

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "agent";
}

function placement(value: string | undefined): Placement {
  const normalized = value?.toLowerCase();
  if (normalized === "down" || normalized === "bottom") return "down";
  if (normalized === "tab") return "tab";
  if (normalized === "window") return "window";
  return "right";
}

async function wezterm(pi: ExtensionAPI, args: string[], timeout = 10000) {
  const result = await pi.exec("wezterm", ["cli", "--prefer-mux", ...args], { timeout });
  return { stdout: result.stdout?.trim() ?? "", stderr: result.stderr?.trim() ?? "", code: result.code };
}

async function gitRoot(pi: ExtensionAPI, cwd: string) {
  const result = await pi.exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { timeout: 10000 });
  return result.code === 0 && result.stdout.trim() ? result.stdout.trim() : cwd;
}

async function maybeWorktree(pi: ExtensionAPI, cwd: string, role: string) {
  const root = await gitRoot(pi, cwd);
  const path = join(root, ".pi", "wt", `matrix-${slug(role)}`);
  const branch = `matrix/${slug(role)}`;
  await mkdir(join(root, ".pi", "wt"), { recursive: true });
  const existing = await pi.exec("git", ["-C", root, "worktree", "list", "--porcelain"], { timeout: 10000 });
  if (existing.stdout.includes(`worktree ${path}\n`)) return path;
  const result = await pi.exec("git", ["-C", root, "worktree", "add", "-b", branch, path, "HEAD"], { timeout: 30000 });
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || "git worktree add failed");
  return path;
}

function agentPrompt(role: string, task: string, worktree?: string) {
  const scope = worktree
    ? `Work only in this git worktree: ${worktree}`
    : "Use the current checkout. Do not create branches/worktrees unless asked.";
  return `You are Matrix ${role}. ${scope}\n\nTask:\n${task}`;
}

function commandFor(role: string, task: string, model: string, tools: string[] | undefined, worktree: string | undefined) {
  const args = ["pi", "--name", `matrix-${role}`, "--model", model];
  if (tools?.length) args.push("--tools", tools.join(","));
  args.push(agentPrompt(role, task, worktree));
  return args;
}

export default function matrixExtension(pi: ExtensionAPI) {
  const panes = new Map<string, AgentPane>();
  let lastPane = "";

  async function spawn(ctx: ExtensionContext, params: { role: string; task: string; model?: string; tools?: string[]; worktree?: boolean; placement?: string }) {
    const role = slug(params.role);
    const defaults = ROLE_DEFAULTS[role] ?? ROLE_DEFAULTS.worker;
    const worktree = params.worktree ? await maybeWorktree(pi, ctx.cwd, role) : undefined;
    const cwd = worktree ?? ctx.cwd;
    const model = params.model ?? defaults.model;
    const tools = params.tools ?? defaults.tools;
    const place = placement(params.placement);
    const command = commandFor(role, params.task, model, tools, worktree);
    const targetPane = lastPane || Array.from(panes.values()).at(-1)?.pane;

    const args = !targetPane || place === "window"
      ? ["spawn", "--new-window", "--workspace", WORKSPACE, "--cwd", cwd, "--", ...command]
      : place === "tab"
        ? ["spawn", "--pane-id", targetPane, "--cwd", cwd, "--", ...command]
        : ["split-pane", "--pane-id", targetPane, place === "down" ? "--bottom" : "--right", "--cwd", cwd, "--", ...command];

    const result = await wezterm(pi, args, 15000);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "wezterm spawn failed");
    const paneId = result.stdout;
    lastPane = paneId;
    panes.set(role, { role, pane: paneId, cwd, model, tools, worktree, placement: place });
    await wezterm(pi, ["set-tab-title", "--pane-id", paneId, `matrix-${role}`]).catch(() => undefined);
    ctx.ui.setStatus("matrix", `matrix ${panes.size} agents`);
    return panes.get(role)!;
  }

  async function send(role: string, message: string) {
    const pane = panes.get(slug(role));
    if (!pane) throw new Error(`Unknown Matrix agent: ${role}`);
    const result = await wezterm(pi, ["send-text", "--no-paste", "--pane-id", pane.pane, message.endsWith("\n") ? message : `${message}\n`]);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "wezterm send failed");
  }

  async function capture(role: string | undefined, lines = 80) {
    const targets = role ? [panes.get(slug(role))].filter(Boolean) as AgentPane[] : Array.from(panes.values());
    if (!targets.length) throw new Error(role ? `Unknown Matrix agent: ${role}` : "No Matrix agents known");
    const blocks = [];
    for (const pane of targets) {
      const result = await wezterm(pi, ["get-text", "--pane-id", pane.pane, "--start-line", `-${Math.max(1, lines)}`], 10000);
      blocks.push(`## ${pane.role}\n${result.stdout || result.stderr}`);
    }
    return blocks.join("\n\n---\n\n");
  }

  async function attach(ctx: ExtensionContext) {
    const result = await wezterm(pi, ["spawn", "--new-window", "--workspace", WORKSPACE, "--cwd", ctx.cwd], 15000);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "wezterm spawn failed");
    lastPane = result.stdout;
    ctx.ui.setStatus("matrix", panes.size ? `matrix ${panes.size} agents` : "matrix workspace");
    return result.stdout || "opened";
  }

  async function kill(ctx: ExtensionContext, role?: string) {
    if (!role || role === "all") {
      for (const pane of panes.values()) await wezterm(pi, ["kill-pane", "--pane-id", pane.pane]).catch(() => undefined);
      panes.clear();
      lastPane = "";
      ctx.ui.setStatus("matrix", undefined);
      return "Matrix panes killed.";
    }
    const pane = panes.get(slug(role));
    if (!pane) return `Unknown Matrix agent: ${role}`;
    await wezterm(pi, ["kill-pane", "--pane-id", pane.pane]);
    panes.delete(pane.role);
    if (lastPane === pane.pane) lastPane = Array.from(panes.values()).at(-1)?.pane ?? "";
    ctx.ui.setStatus("matrix", panes.size ? `matrix ${panes.size} agents` : undefined);
    return `Killed ${pane.role}.`;
  }

  pi.registerCommand("matrix-help", {
    description: "Explain Matrix WezTerm agent orchestration",
    handler: async (_args, ctx) => ctx.ui.notify(MATRIX_HELP, "info"),
  });

  pi.registerCommand("matrix", {
    description: "Start a WezTerm Matrix with scout and planner agents for a task",
    handler: async (args, ctx) => {
      const task = args.trim();
      if (!task) return ctx.ui.notify("Usage: /matrix <task>", "warning");
      try {
        await spawn(ctx, { role: "scout", task, placement: "window" });
        await spawn(ctx, { role: "planner", task, placement: "right" });
        ctx.ui.notify("Matrix ready in WezTerm", "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("matrix-attach", {
    description: "Open the Matrix WezTerm workspace",
    handler: async (_args, ctx) => {
      try {
        ctx.ui.notify(`WezTerm pane: ${await attach(ctx)}`, "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("matrix-spawn", {
    description: "Spawn one Matrix agent: /matrix-spawn <role> <task>",
    handler: async (args, ctx) => {
      const [role, ...rest] = args.trim().split(/\s+/);
      if (!role || rest.length === 0) return ctx.ui.notify("Usage: /matrix-spawn <role> <task>", "warning");
      try {
        const pane = await spawn(ctx, { role, task: rest.join(" ") });
        ctx.ui.notify(`Spawned ${pane.role} in ${pane.pane}`, "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("matrix-send", {
    description: "Send to a Matrix agent: /matrix-send <role> <message>",
    handler: async (args, ctx) => {
      const [role, ...rest] = args.trim().split(/\s+/);
      if (!role || rest.length === 0) return ctx.ui.notify("Usage: /matrix-send <role> <message>", "warning");
      try {
        await send(role, rest.join(" "));
        ctx.ui.notify(`Sent to ${role}`, "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("matrix-capture", {
    description: "Capture Matrix output: /matrix-capture [role]",
    handler: async (args, ctx) => {
      try {
        ctx.ui.notify(await capture(args.trim() || undefined), "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("matrix-kill", {
    description: "Kill Matrix agent panes: /matrix-kill [role|all]",
    handler: async (args, ctx) => ctx.ui.notify(await kill(ctx, args.trim() || undefined), "info"),
  });

  pi.registerTool({
    name: "matrix_spawn",
    label: "Matrix Spawn",
    description: "Spawn a parent-controlled pi agent in a WezTerm Matrix pane.",
    promptSnippet: "Spawn a WezTerm-backed Matrix subagent pane",
    promptGuidelines: ["Use matrix_spawn when the user wants visible WezTerm agent orchestration."],
    parameters: SPAWN_PARAMS,
    async execute(_id, params, _signal, _update, ctx) {
      const pane = await spawn(ctx, params);
      return { content: [{ type: "text", text: `Spawned ${pane.role} in ${pane.pane}${pane.worktree ? `\nWorktree: ${pane.worktree}` : ""}` }], details: pane };
    },
  });

  pi.registerTool({
    name: "matrix_attach",
    label: "Matrix Attach",
    description: "Open the Matrix WezTerm workspace.",
    promptSnippet: "Open the Matrix WezTerm workspace",
    promptGuidelines: ["Use matrix_attach when the user wants to view Matrix panes in WezTerm."],
    parameters: ATTACH_PARAMS,
    async execute(_id, _params, _signal, _update, ctx) {
      const pane = await attach(ctx);
      return { content: [{ type: "text", text: `WezTerm pane: ${pane}` }], details: { pane, workspace: WORKSPACE } };
    },
  });

  pi.registerTool({
    name: "matrix_send",
    label: "Matrix Send",
    description: "Send a message to a Matrix WezTerm pane.",
    promptSnippet: "Send a message to a Matrix WezTerm pane",
    promptGuidelines: ["Use matrix_send to steer an existing Matrix pane."],
    parameters: SEND_PARAMS,
    async execute(_id, params) {
      await send(params.role, params.message);
      return { content: [{ type: "text", text: `Sent to ${params.role}` }], details: params };
    },
  });

  pi.registerTool({
    name: "matrix_capture",
    label: "Matrix Capture",
    description: "Capture recent output from one or all Matrix WezTerm panes.",
    promptSnippet: "Capture recent output from Matrix panes",
    promptGuidelines: ["Use matrix_capture before summarizing or acting on Matrix agent results."],
    parameters: CAPTURE_PARAMS,
    async execute(_id, params) {
      const text = await capture(params.role, params.lines ?? 80);
      return { content: [{ type: "text", text }], details: { role: params.role, lines: params.lines ?? 80 } };
    },
  });

  pi.registerTool({
    name: "matrix_list",
    label: "Matrix List",
    description: "List known Matrix WezTerm agents in this pi session.",
    promptSnippet: "List known Matrix panes",
    promptGuidelines: ["Use matrix_list to inspect active Matrix agents."],
    parameters: Type.Object({}),
    async execute() {
      const agents = Array.from(panes.values());
      const text = agents.length ? agents.map((pane) => `${pane.role}: ${pane.pane} ${pane.model}${pane.worktree ? ` (${pane.worktree})` : ""}`).join("\n") : "No Matrix agents.";
      return { content: [{ type: "text", text }], details: { workspace: WORKSPACE, agents } };
    },
  });

  pi.registerTool({
    name: "matrix_kill",
    label: "Matrix Kill",
    description: "Kill one Matrix WezTerm pane or all known Matrix panes.",
    promptSnippet: "Kill Matrix panes",
    promptGuidelines: ["Use matrix_kill after Matrix agents finish or when the user asks to clean up."],
    parameters: KILL_PARAMS,
    async execute(_id, params, _signal, _update, ctx) {
      const text = await kill(ctx, params.role);
      return { content: [{ type: "text", text }], details: { role: params.role } };
    },
  });
}
