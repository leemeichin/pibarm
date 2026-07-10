import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { basename } from "node:path";

const SPAWN_PARAMS = Type.Object({
  role: Type.String({ description: "Agent role/name, e.g. scout, planner, worker, reviewer" }),
  task: Type.String({ description: "Task or prompt for the agent" }),
  model: Type.Optional(Type.String({ description: "Optional pi model, e.g. anthropic/claude-haiku-4-5" })),
  tools: Type.Optional(Type.Array(Type.String(), { description: "Optional tool allowlist for the agent" })),
  worktree: Type.Optional(Type.Boolean({ description: "Run in a new git worktree when this agent needs an isolated branch" })),
});

const SEND_PARAMS = Type.Object({
  role: Type.String({ description: "Agent role/name" }),
  message: Type.String({ description: "Message to send to that tmux pane" }),
});

const CAPTURE_PARAMS = Type.Object({
  role: Type.Optional(Type.String({ description: "Agent role/name. Omit to capture all known agents" })),
  lines: Type.Optional(Type.Number({ description: "Number of recent pane lines to capture. Defaults to 80" })),
});

const KILL_PARAMS = Type.Object({
  role: Type.Optional(Type.String({ description: "Agent role/name. Omit or use all to kill the whole Matrix session" })),
});

const ATTACH_PARAMS = Type.Object({});

const ROLE_DEFAULTS: Record<string, { model: string; tools?: string[] }> = {
  scout: { model: "anthropic/claude-haiku-4-5", tools: ["read", "grep", "find", "ls", "bash"] },
  planner: { model: "anthropic/claude-sonnet-4-5", tools: ["read", "grep", "find", "ls", "question", "elicit_plan_questions"] },
  worker: { model: "anthropic/claude-sonnet-4-5" },
  reviewer: { model: "anthropic/claude-sonnet-4-5", tools: ["read", "grep", "find", "ls", "bash"] },
};

type AgentPane = { role: string; pane: string; cwd: string; model: string; tools?: string[]; worktree?: string };

const MATRIX_HELP = `Matrix is a tmux-backed cockpit for visible parent-controlled agents.

When to use it:
- use Matrix when you want to watch/steer multiple agents in panes
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
/matrix-attach                 open WezTerm workspace "matrix"
/matrix-spawn <role> <task>    spawn scout/planner/worker/reviewer
/matrix-send <role> <message>  steer a pane
/matrix-capture [role]         read recent pane output
/matrix-kill [role|all]        clean up

Prior art: pi-cmux is worth checking if you use cmux. It provides polished terminal splits, notifications, sidebars, continuation, and review handoff. Matrix stays tmux/WezTerm-native and parent-controlled.`;

function sh(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "agent";
}

async function exec(pi: ExtensionAPI, args: string[], timeout = 10000) {
  const result = await pi.exec("tmux", args, { timeout });
  return { stdout: result.stdout?.trim() ?? "", stderr: result.stderr?.trim() ?? "", code: result.code };
}

async function wezterm(pi: ExtensionAPI, args: string[], timeout = 10000) {
  const result = await pi.exec("wezterm", args, { timeout });
  return { stdout: result.stdout?.trim() ?? "", stderr: result.stderr?.trim() ?? "", code: result.code };
}

async function gitRoot(pi: ExtensionAPI, cwd: string) {
  const result = await pi.exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { timeout: 10000 });
  return result.code === 0 && result.stdout.trim() ? result.stdout.trim() : cwd;
}

async function maybeWorktree(pi: ExtensionAPI, cwd: string, role: string) {
  const root = await gitRoot(pi, cwd);
  const parent = root.includes("/") ? root.slice(0, root.lastIndexOf("/")) : ".";
  const path = `${parent}/${basename(root)}-matrix-${slug(role)}`;
  const branch = `matrix/${slug(role)}`;
  const existing = await pi.exec("git", ["-C", root, "worktree", "list", "--porcelain"], { timeout: 10000 });
  if (existing.stdout.includes(`worktree ${path}\n`)) return path;
  const result = await pi.exec("git", ["-C", root, "worktree", "add", "-b", branch, path, "HEAD"], { timeout: 30000 });
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || "git worktree add failed");
  return path;
}

function sessionName(cwd: string) {
  return `matrix-${slug(basename(cwd))}`;
}

function agentPrompt(role: string, task: string, worktree?: string) {
  const scope = worktree
    ? `Work only in this git worktree: ${worktree}`
    : "Use the current checkout. Do not create branches/worktrees unless asked.";
  return `You are Matrix ${role}. ${scope}\n\nTask:\n${task}`;
}

async function ensureSession(pi: ExtensionAPI, ctx: ExtensionContext, session: string, cwd: string) {
  const has = await exec(pi, ["has-session", "-t", session]);
  if (has.code === 0) return;
  const result = await exec(pi, ["new-session", "-d", "-s", session, "-n", "matrix", "-c", cwd], 10000);
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || "tmux new-session failed");
  ctx.ui.setStatus("matrix", `matrix ${session}`);
}

function commandFor(role: string, task: string, model: string, tools: string[] | undefined, worktree: string | undefined) {
  const args = ["pi", "--name", `matrix-${role}`, "--model", model];
  if (tools?.length) args.push("--tools", tools.join(","));
  args.push(agentPrompt(role, task, worktree));
  return args.map(sh).join(" ");
}

export default function matrixExtension(pi: ExtensionAPI) {
  const panes = new Map<string, AgentPane>();
  let currentSession = "";

  async function spawn(ctx: ExtensionContext, params: { role: string; task: string; model?: string; tools?: string[]; worktree?: boolean }) {
    const session = sessionName(ctx.cwd);
    currentSession = session;
    await ensureSession(pi, ctx, session, ctx.cwd);

    const role = slug(params.role);
    const defaults = ROLE_DEFAULTS[role] ?? ROLE_DEFAULTS.worker;
    const worktree = params.worktree ? await maybeWorktree(pi, ctx.cwd, role) : undefined;
    const cwd = worktree ?? ctx.cwd;
    const model = params.model ?? defaults.model;
    const tools = params.tools ?? defaults.tools;
    const command = commandFor(role, params.task, model, tools, worktree);
    const target = `${session}:matrix`;
    const hasPane = panes.size === 0 ? await exec(pi, ["list-panes", "-t", target, "-F", "#{pane_id}:#{pane_current_command}"]) : undefined;
    const useFirstPane = hasPane?.stdout.split("\n").length === 1 && /:(zsh|bash|fish|sh|tmux)$/.test(hasPane.stdout);
    const paneId = useFirstPane
      ? (await exec(pi, ["display-message", "-p", "-t", target, "#{pane_id}"])).stdout
      : "";
    const result = useFirstPane
      ? await exec(pi, ["send-keys", "-t", target, command, "Enter"])
      : await exec(pi, ["split-window", "-d", "-P", "-F", "#{pane_id}", "-t", target, "-c", cwd, command]);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "tmux spawn failed");
    await exec(pi, ["select-layout", "-t", target, "tiled"]);
    const newPaneId = paneId || result.stdout;
    panes.set(role, { role, pane: newPaneId, cwd, model, tools, worktree });
    ctx.ui.setStatus("matrix", `matrix ${panes.size} agents`);
    return panes.get(role)!;
  }

  async function send(role: string, message: string) {
    const pane = panes.get(slug(role));
    if (!pane) throw new Error(`Unknown Matrix agent: ${role}`);
    const result = await exec(pi, ["send-keys", "-t", pane.pane, message, "Enter"]);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "tmux send failed");
  }

  async function capture(role: string | undefined, lines = 80) {
    const targets = role ? [panes.get(slug(role))].filter(Boolean) as AgentPane[] : Array.from(panes.values());
    if (!targets.length) throw new Error(role ? `Unknown Matrix agent: ${role}` : "No Matrix agents known");
    const blocks = [];
    for (const pane of targets) {
      const result = await exec(pi, ["capture-pane", "-p", "-t", pane.pane, "-S", `-${Math.max(1, lines)}`], 10000);
      blocks.push(`## ${pane.role}\n${result.stdout || result.stderr}`);
    }
    return blocks.join("\n\n---\n\n");
  }

  async function attach(ctx: ExtensionContext) {
    const session = currentSession || sessionName(ctx.cwd);
    await ensureSession(pi, ctx, session, ctx.cwd);
    currentSession = session;
    const result = await wezterm(pi, ["cli", "--prefer-mux", "spawn", "--new-window", "--workspace", "matrix", "--cwd", ctx.cwd, "--", "tmux", "attach", "-t", session], 15000);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "wezterm spawn failed");
    return result.stdout || "attached";
  }

  async function kill(ctx: ExtensionContext, role?: string) {
    if (!role || role === "all") {
      if (currentSession) await exec(pi, ["kill-session", "-t", currentSession]);
      panes.clear();
      ctx.ui.setStatus("matrix", undefined);
      return "Matrix session killed.";
    }
    const pane = panes.get(slug(role));
    if (!pane) return `Unknown Matrix agent: ${role}`;
    await exec(pi, ["kill-pane", "-t", pane.pane]);
    panes.delete(pane.role);
    ctx.ui.setStatus("matrix", panes.size ? `matrix ${panes.size} agents` : undefined);
    return `Killed ${pane.role}.`;
  }

  pi.registerCommand("matrix-help", {
    description: "Explain Matrix tmux/WezTerm agent orchestration",
    handler: async (_args, ctx) => ctx.ui.notify(MATRIX_HELP, "info"),
  });

  pi.registerCommand("matrix", {
    description: "Start a tmux Matrix with scout and planner agents for a task",
    handler: async (args, ctx) => {
      const task = args.trim();
      if (!task) return ctx.ui.notify("Usage: /matrix <task>", "warning");
      try {
        await spawn(ctx, { role: "scout", task });
        await spawn(ctx, { role: "planner", task });
        ctx.ui.notify(`Matrix ready: ${currentSession}`, "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("matrix-attach", {
    description: "Open the Matrix tmux session in a WezTerm matrix workspace",
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
    description: "Kill Matrix agent/session: /matrix-kill [role|all]",
    handler: async (args, ctx) => ctx.ui.notify(await kill(ctx, args.trim() || undefined), "info"),
  });

  pi.registerTool({
    name: "matrix_spawn",
    label: "Matrix Spawn",
    description: "Spawn a parent-controlled pi agent in a tmux Matrix pane.",
    promptSnippet: "Spawn a tmux-backed Matrix subagent pane",
    promptGuidelines: ["Use matrix_spawn when the user wants visible tmux/WezTerm agent orchestration."],
    parameters: SPAWN_PARAMS,
    async execute(_id, params, _signal, _update, ctx) {
      const pane = await spawn(ctx, params);
      return { content: [{ type: "text", text: `Spawned ${pane.role} in ${pane.pane}${pane.worktree ? `\nWorktree: ${pane.worktree}` : ""}` }], details: pane };
    },
  });

  pi.registerTool({
    name: "matrix_attach",
    label: "Matrix Attach",
    description: "Open the Matrix tmux session in a WezTerm matrix workspace.",
    promptSnippet: "Attach WezTerm to the Matrix tmux session",
    promptGuidelines: ["Use matrix_attach when the user wants to view Matrix tmux panes in WezTerm."],
    parameters: ATTACH_PARAMS,
    async execute(_id, _params, _signal, _update, ctx) {
      const pane = await attach(ctx);
      return { content: [{ type: "text", text: `WezTerm pane: ${pane}` }], details: { pane, session: currentSession } };
    },
  });

  pi.registerTool({
    name: "matrix_send",
    label: "Matrix Send",
    description: "Send a message to a Matrix tmux agent pane.",
    promptSnippet: "Send a message to a Matrix tmux agent pane",
    promptGuidelines: ["Use matrix_send to steer an existing Matrix agent pane."],
    parameters: SEND_PARAMS,
    async execute(_id, params) {
      await send(params.role, params.message);
      return { content: [{ type: "text", text: `Sent to ${params.role}` }], details: params };
    },
  });

  pi.registerTool({
    name: "matrix_capture",
    label: "Matrix Capture",
    description: "Capture recent output from one or all Matrix tmux panes.",
    promptSnippet: "Capture recent output from Matrix tmux agent panes",
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
    description: "List known Matrix tmux agents in this pi session.",
    promptSnippet: "List known Matrix tmux agent panes",
    promptGuidelines: ["Use matrix_list to inspect active Matrix agents."],
    parameters: Type.Object({}),
    async execute() {
      const agents = Array.from(panes.values());
      const text = agents.length ? agents.map((pane) => `${pane.role}: ${pane.pane} ${pane.model}${pane.worktree ? ` (${pane.worktree})` : ""}`).join("\n") : "No Matrix agents.";
      return { content: [{ type: "text", text }], details: { session: currentSession, agents } };
    },
  });

  pi.registerTool({
    name: "matrix_kill",
    label: "Matrix Kill",
    description: "Kill one Matrix tmux agent pane or the whole Matrix session.",
    promptSnippet: "Kill Matrix tmux agent panes",
    promptGuidelines: ["Use matrix_kill after Matrix agents finish or when the user asks to clean up."],
    parameters: KILL_PARAMS,
    async execute(_id, params, _signal, _update, ctx) {
      const text = await kill(ctx, params.role);
      return { content: [{ type: "text", text }], details: { role: params.role } };
    },
  });

  pi.on("session_shutdown", async () => {
    if (process.env.PI_MATRIX_KEEP_ON_EXIT === "1" || !currentSession) return;
    await exec(pi, ["kill-session", "-t", currentSession]).catch(() => undefined);
  });
}
