import { mkdir, readFile } from "node:fs/promises";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { basename, join } from "node:path";
import { selectAgentModelRef, type ModelSelection } from "../lib/current-model.js";

const WORKSPACE_PREFIX = "matrix";

const SPAWN_PARAMS = Type.Object({
  role: Type.String({ description: "Agent role/name, e.g. scout, planner, worker, reviewer" }),
  task: Type.String({ description: "Task or prompt for the agent" }),
  model: Type.Optional(Type.String({ description: "Optional pi model. Defaults to the current active model, with a lighter available model for simple tasks." })),
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

const JOIN_PARAMS = Type.Object({
  role: Type.Optional(Type.String({ description: "Agent role/name. Omit or use all to wait for all known Matrix agents" })),
  timeoutMs: Type.Optional(Type.Number({ description: "Maximum time to wait in milliseconds. Defaults to 10 minutes" })),
  kill: Type.Optional(Type.Boolean({ description: "Kill panes after they finish. Defaults to true" })),
});

const KILL_PARAMS = Type.Object({
  role: Type.Optional(Type.String({ description: "Agent role/name. Omit or use all to kill known Matrix panes and untracked panes in the Matrix workspace" })),
});

const ATTACH_PARAMS = Type.Object({});

const ROLE_DEFAULTS: Record<string, { tools?: string[] }> = {
  scout: { tools: ["read", "grep", "find", "ls", "bash"] },
  planner: { tools: ["read", "grep", "find", "ls", "question", "elicit_plan_questions"] },
  worker: {},
  reviewer: { tools: ["read", "grep", "find", "ls", "bash"] },
};

type Placement = "right" | "down" | "tab" | "window";
type AgentPane = {
  role: string;
  pane: string;
  workspace: string;
  cwd: string;
  model?: string;
  modelSelection: ModelSelection;
  tools?: string[];
  worktree?: string;
  placement: Placement;
  logPath: string;
  statusPath: string;
};

type WeztermPane = { pane_id: number; tab_id: number; window_id: number; workspace?: string; tab_title?: string; title?: string };

const MATRIX_HELP = `Matrix is a WezTerm-native cockpit for visible parent-controlled agents.

When to use it:
- use Matrix when you want to watch agents run in WezTerm tabs or splits
- Matrix uses a project/session-specific WezTerm workspace and opens/focuses it automatically
- Matrix agents run non-interactively and auto-exit when their task is done
- use run_subagent/run_subagents for headless one-shot checks
- use worktrees for separate branch/risky worker changes
- use the current checkout for same-branch distributed work

Common flow:
1. /matrix-attach
2. /matrix-spawn scout map the relevant code
3. /matrix-spawn planner propose a small safe plan
4. /matrix-join
5. Review the returned logs

Commands:
/matrix <task>                 start scout + planner in split panes
/matrix-attach                 focus or create the WezTerm Matrix workspace window
/matrix-spawn <role> <task>    spawn scout/planner/worker/reviewer
/matrix-send <role> <message>  send to a still-running pane
/matrix-capture [role]         read pane/log output
/matrix-join [role|all]        wait for agents to finish, then clean up panes
/matrix-kill [role|all]        force-kill Matrix panes`;

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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function wezterm(pi: ExtensionAPI, args: string[], timeout = 10000) {
  const result = await pi.exec("wezterm", ["cli", "--prefer-mux", ...args], { timeout });
  return { stdout: result.stdout?.trim() ?? "", stderr: result.stderr?.trim() ?? "", code: result.code };
}

async function listWeztermPanes(pi: ExtensionAPI): Promise<WeztermPane[]> {
  const result = await wezterm(pi, ["list", "--format", "json"], 10000);
  if (result.code !== 0 || !result.stdout) return [];
  try {
    return JSON.parse(result.stdout) as WeztermPane[];
  } catch {
    return [];
  }
}

function workspaceName(ctx: ExtensionContext) {
  const project = slug(basename(ctx.cwd));
  const session = slug(ctx.sessionManager.getSessionId()).slice(0, 8);
  return `${WORKSPACE_PREFIX}-${project}-${session}`;
}

function isMatrixWorkspace(value: string | undefined) {
  return value === WORKSPACE_PREFIX || Boolean(value?.startsWith(`${WORKSPACE_PREFIX}-`));
}

async function workspacePanes(pi: ExtensionAPI, workspace: string) {
  return (await listWeztermPanes(pi)).filter((pane) => pane.workspace === workspace);
}

async function allMatrixPanes(pi: ExtensionAPI) {
  return (await listWeztermPanes(pi)).filter((pane) => isMatrixWorkspace(pane.workspace));
}

async function resolveTargetPane(pi: ExtensionAPI, workspaceName: string, lastPane: string, panes: Map<string, AgentPane>) {
  const workspace = await workspacePanes(pi, workspaceName);
  const ids = new Set(workspace.map((pane) => String(pane.pane_id)));
  if (lastPane && ids.has(lastPane)) return lastPane;
  const recentKnown = Array.from(panes.values()).reverse().find((pane) => ids.has(pane.pane));
  return recentKnown?.pane ?? (workspace[0] ? String(workspace[0].pane_id) : "");
}

async function gitRoot(pi: ExtensionAPI, cwd: string) {
  const result = await pi.exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { timeout: 10000 });
  return result.code === 0 && result.stdout.trim() ? result.stdout.trim() : cwd;
}

async function matrixStatePaths(pi: ExtensionAPI, cwd: string, role: string) {
  const root = await gitRoot(pi, cwd);
  const dir = join(root, ".pi", "matrix");
  await mkdir(dir, { recursive: true });
  const run = `${slug(role)}-${Date.now()}`;
  return { logPath: join(dir, `${run}.log`), statusPath: join(dir, `${run}.status`) };
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

function commandFor(role: string, task: string, model: string | undefined, tools: string[] | undefined, worktree: string | undefined, logPath: string, statusPath: string) {
  const args = ["pi", "--name", `matrix-${role}`, "-p", "--no-session"];
  if (model) args.push("--model", model);
  if (tools?.length) args.push("--tools", tools.join(","));
  args.push(agentPrompt(role, task, worktree));

  const piCommand = args.map(shellQuote).join(" ");
  const script = [
    `: > ${shellQuote(logPath)}`,
    `printf '%s\\n' ${shellQuote(`[matrix ${role} started]`)} | tee -a ${shellQuote(logPath)}`,
    "set -o pipefail",
    `${piCommand} 2>&1 | tee -a ${shellQuote(logPath)}`,
    "code=${PIPESTATUS[0]}",
    `printf '\\n[matrix ${role} exited %s]\\n' "$code" | tee -a ${shellQuote(logPath)}`,
    `printf '%s\\n' "$code" > ${shellQuote(statusPath)}`,
    "exit \"$code\"",
  ].join("; ");

  return ["bash", "-lc", script];
}

async function readStatus(pane: AgentPane): Promise<number | undefined> {
  try {
    const raw = await readFile(pane.statusPath, "utf8");
    const code = Number(raw.trim());
    return Number.isFinite(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

function tailLines(text: string, lines: number) {
  const all = text.split("\n");
  return all.slice(-Math.max(1, lines)).join("\n");
}

async function readLog(pane: AgentPane, lines = 80) {
  try {
    return tailLines(await readFile(pane.logPath, "utf8"), lines);
  } catch {
    return "";
  }
}

export default function matrixExtension(pi: ExtensionAPI) {
  const panes = new Map<string, AgentPane>();
  let lastPane = "";

  function updateStatus(ctx: ExtensionContext) {
    ctx.ui.setStatus("matrix", panes.size ? `matrix ${panes.size} agents` : undefined);
  }

  function uniqueRole(baseRole: string) {
    if (!panes.has(baseRole)) return baseRole;
    for (let i = 2; i < 1000; i++) {
      const candidate = `${baseRole}-${i}`;
      if (!panes.has(candidate)) return candidate;
    }
    return `${baseRole}-${Date.now()}`;
  }

  function paneFor(role: string) {
    const requested = slug(role);
    const exact = panes.get(requested);
    if (exact) return exact;
    const matches = Array.from(panes.values()).filter((pane) => pane.role.startsWith(`${requested}-`));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`Ambiguous Matrix agent: ${role}. Use one of: ${matches.map((pane) => pane.role).join(", ")}`);
    return undefined;
  }

  async function spawn(ctx: ExtensionContext, params: { role: string; task: string; model?: string; tools?: string[]; worktree?: boolean; placement?: string }) {
    const baseRole = slug(params.role);
    const role = uniqueRole(baseRole);
    const workspace = workspaceName(ctx);
    const defaults = ROLE_DEFAULTS[baseRole] ?? ROLE_DEFAULTS.worker;
    const worktree = params.worktree ? await maybeWorktree(pi, ctx.cwd, role) : undefined;
    const cwd = worktree ?? ctx.cwd;
    const modelSelection = selectAgentModelRef(ctx, params.model, params.task);
    const model = modelSelection.model;
    const tools = params.tools ?? defaults.tools;
    const place = placement(params.placement);
    const { logPath, statusPath } = await matrixStatePaths(pi, cwd, role);
    const command = commandFor(role, params.task, model, tools, worktree, logPath, statusPath);
    const targetPane = await resolveTargetPane(pi, workspace, lastPane, panes);
    if (targetPane) await wezterm(pi, ["activate-pane", "--pane-id", targetPane]).catch(() => undefined);

    const args = !targetPane
      ? ["spawn", "--new-window", "--workspace", workspace, "--cwd", cwd, "--", ...command]
      : place === "tab" || place === "window"
        ? ["spawn", "--pane-id", targetPane, "--cwd", cwd, "--", ...command]
        : ["split-pane", "--pane-id", targetPane, place === "down" ? "--bottom" : "--right", "--cwd", cwd, "--", ...command];

    const result = await wezterm(pi, args, 15000);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "wezterm spawn failed");
    const paneId = result.stdout;
    lastPane = paneId;
    panes.set(role, { role, pane: paneId, workspace, cwd, model, modelSelection, tools, worktree, placement: place, logPath, statusPath });
    await wezterm(pi, ["set-tab-title", "--pane-id", paneId, `matrix-${role}`]).catch(() => undefined);
    await wezterm(pi, ["activate-pane", "--pane-id", paneId]).catch(() => undefined);
    ctx.ui.setStatus("matrix", `matrix ${panes.size} agents`);
    return panes.get(role)!;
  }

  async function send(role: string, message: string) {
    const pane = paneFor(role);
    if (!pane) throw new Error(`Unknown Matrix agent: ${role}`);
    const status = await readStatus(pane);
    if (status !== undefined) throw new Error(`Matrix agent ${pane.role} has already exited with code ${status}`);
    const result = await wezterm(pi, ["send-text", "--no-paste", "--pane-id", pane.pane, message.endsWith("\n") ? message : `${message}\n`]);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "wezterm send failed");
  }

  async function capture(role: string | undefined, lines = 80) {
    const targets = role ? [paneFor(role)].filter(Boolean) as AgentPane[] : Array.from(panes.values());
    if (!targets.length) throw new Error(role ? `Unknown Matrix agent: ${role}` : "No Matrix agents known");
    const blocks = [];
    for (const pane of targets) {
      const result = await wezterm(pi, ["get-text", "--pane-id", pane.pane, "--start-line", `-${Math.max(1, lines)}`], 10000);
      const log = result.code === 0 && result.stdout ? result.stdout : await readLog(pane, lines);
      const status = await readStatus(pane);
      blocks.push(`## ${pane.role}${status !== undefined ? ` (exited ${status})` : ""}\n${log || result.stderr}`);
    }
    return blocks.join("\n\n---\n\n");
  }

  async function attach(ctx: ExtensionContext) {
    const workspace = workspaceName(ctx);
    const existing = await resolveTargetPane(pi, workspace, lastPane, panes);
    if (existing) {
      await wezterm(pi, ["activate-pane", "--pane-id", existing]).catch(() => undefined);
      lastPane = existing;
      ctx.ui.setStatus("matrix", panes.size ? `matrix ${panes.size} agents` : "matrix workspace");
      return existing;
    }
    const result = await wezterm(pi, ["spawn", "--new-window", "--workspace", workspace, "--cwd", ctx.cwd], 15000);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "wezterm spawn failed");
    lastPane = result.stdout;
    await wezterm(pi, ["activate-pane", "--pane-id", lastPane]).catch(() => undefined);
    ctx.ui.setStatus("matrix", panes.size ? `matrix ${panes.size} agents` : "matrix workspace");
    return result.stdout || "opened";
  }

  async function joinAgents(ctx: ExtensionContext, role?: string, timeoutMs = 600000, killDone = true) {
    const targets = !role || role === "all" ? Array.from(panes.values()) : [paneFor(role)].filter(Boolean) as AgentPane[];
    if (!targets.length) throw new Error(role && role !== "all" ? `Unknown Matrix agent: ${role}` : "No Matrix agents known");

    const deadline = Date.now() + Math.max(0, timeoutMs);
    while (Date.now() <= deadline) {
      const statuses = await Promise.all(targets.map(readStatus));
      if (statuses.every((status) => status !== undefined)) break;
      await sleep(500);
    }

    const blocks = [];
    const stillRunning = [];
    for (const pane of targets) {
      const status = await readStatus(pane);
      if (status === undefined) {
        stillRunning.push(pane.role);
        blocks.push(`## ${pane.role}\n(still running)`);
        continue;
      }
      blocks.push(`## ${pane.role} (exited ${status})\n${await readLog(pane, 200)}`);
      if (killDone) await wezterm(pi, ["kill-pane", "--pane-id", pane.pane]).catch(() => undefined);
      panes.delete(pane.role);
    }

    if (lastPane && !Array.from(panes.values()).some((pane) => pane.pane === lastPane)) {
      lastPane = await resolveTargetPane(pi, workspaceName(ctx), "", panes);
    }
    updateStatus(ctx);
    return `${stillRunning.length ? `Timed out waiting for: ${stillRunning.join(", ")}\n\n` : ""}${blocks.join("\n\n---\n\n")}`;
  }

  async function kill(ctx: ExtensionContext, role?: string) {
    if (!role || role === "all") {
      const ids = new Set<string>();
      for (const pane of panes.values()) ids.add(pane.pane);
      for (const pane of await allMatrixPanes(pi)) ids.add(String(pane.pane_id));
      for (const paneId of ids) await wezterm(pi, ["kill-pane", "--pane-id", paneId]).catch(() => undefined);
      panes.clear();
      lastPane = "";
      ctx.ui.setStatus("matrix", undefined);
      return "Matrix panes killed.";
    }
    const pane = paneFor(role);
    if (!pane) return `Unknown Matrix agent: ${role}`;
    await wezterm(pi, ["kill-pane", "--pane-id", pane.pane]).catch(() => undefined);
    panes.delete(pane.role);
    if (lastPane === pane.pane) lastPane = await resolveTargetPane(pi, workspaceName(ctx), "", panes);
    updateStatus(ctx);
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
        await spawn(ctx, { role: "scout", task, placement: "right" });
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

  pi.registerCommand("matrix-join", {
    description: "Wait for Matrix agents to finish and clean up panes: /matrix-join [role|all]",
    handler: async (args, ctx) => {
      try {
        ctx.ui.notify(await joinAgents(ctx, args.trim() || undefined), "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("matrix-kill", {
    description: "Kill Matrix panes: /matrix-kill [role|all]",
    handler: async (args, ctx) => ctx.ui.notify(await kill(ctx, args.trim() || undefined), "info"),
  });

  pi.registerTool({
    name: "matrix_spawn",
    label: "Matrix Spawn",
    description: "Spawn a parent-controlled pi agent in a WezTerm Matrix pane. The pane exits when the agent finishes.",
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
    description: "Open or focus the Matrix WezTerm workspace.",
    promptSnippet: "Open the Matrix WezTerm workspace",
    promptGuidelines: ["Use matrix_attach when the user wants to view Matrix panes in WezTerm."],
    parameters: ATTACH_PARAMS,
    async execute(_id, _params, _signal, _update, ctx) {
      const pane = await attach(ctx);
      return { content: [{ type: "text", text: `WezTerm pane: ${pane}` }], details: { pane, workspace: workspaceName(ctx) } };
    },
  });

  pi.registerTool({
    name: "matrix_send",
    label: "Matrix Send",
    description: "Send a message to a still-running Matrix WezTerm pane.",
    promptSnippet: "Send a message to a Matrix WezTerm pane",
    promptGuidelines: ["Use matrix_send only while a Matrix agent is still active."],
    parameters: SEND_PARAMS,
    async execute(_id, params) {
      await send(params.role, params.message);
      return { content: [{ type: "text", text: `Sent to ${params.role}` }], details: params };
    },
  });

  pi.registerTool({
    name: "matrix_capture",
    label: "Matrix Capture",
    description: "Capture recent output from one or all Matrix WezTerm panes/logs.",
    promptSnippet: "Capture recent output from Matrix panes",
    promptGuidelines: ["Use matrix_capture before summarizing or acting on Matrix agent results."],
    parameters: CAPTURE_PARAMS,
    async execute(_id, params) {
      const text = await capture(params.role, params.lines ?? 80);
      return { content: [{ type: "text", text }], details: { role: params.role, lines: params.lines ?? 80 } };
    },
  });

  pi.registerTool({
    name: "matrix_join",
    label: "Matrix Join",
    description: "Wait for one or all Matrix agents to finish, capture logs, and clean up panes.",
    promptSnippet: "Wait for Matrix agents and clean up panes",
    promptGuidelines: ["Use matrix_join after spawning Matrix agents when their results are needed."],
    parameters: JOIN_PARAMS,
    async execute(_id, params, _signal, _update, ctx) {
      const text = await joinAgents(ctx, params.role, params.timeoutMs ?? 600000, params.kill ?? true);
      return { content: [{ type: "text", text }], details: { role: params.role, timeoutMs: params.timeoutMs ?? 600000, kill: params.kill ?? true } };
    },
  });

  pi.registerTool({
    name: "matrix_list",
    label: "Matrix List",
    description: "List known Matrix agents and untracked panes in the Matrix workspace.",
    promptSnippet: "List known Matrix panes",
    promptGuidelines: ["Use matrix_list to inspect active Matrix agents."],
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _update, ctx) {
      const workspace = workspaceName(ctx);
      const agents = Array.from(panes.values()).filter((pane) => pane.workspace === workspace);
      const knownIds = new Set(agents.map((pane) => pane.pane));
      const untracked = (await workspacePanes(pi, workspace)).filter((pane) => !knownIds.has(String(pane.pane_id)));
      const lines = [
        ...agents.map((pane) => `${pane.role}: ${pane.pane} ${pane.model ?? "(default model)"}${pane.worktree ? ` (${pane.worktree})` : ""}`),
        ...untracked.map((pane) => `untracked: ${pane.pane_id} window=${pane.window_id} tab=${pane.tab_id} ${pane.title ?? ""}`.trim()),
      ];
      const text = lines.length ? lines.join("\n") : "No Matrix agents.";
      return { content: [{ type: "text", text }], details: { workspace, agents, untracked } };
    },
  });

  pi.registerTool({
    name: "matrix_kill",
    label: "Matrix Kill",
    description: "Kill one Matrix WezTerm pane or all known/untracked Matrix workspace panes.",
    promptSnippet: "Kill Matrix panes",
    promptGuidelines: ["Use matrix_kill after Matrix agents finish or when the user asks to clean up."],
    parameters: KILL_PARAMS,
    async execute(_id, params, _signal, _update, ctx) {
      const text = await kill(ctx, params.role);
      return { content: [{ type: "text", text }], details: { role: params.role } };
    },
  });
}
