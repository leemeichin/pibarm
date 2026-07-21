import { mkdir, readFile } from "node:fs/promises";
import { CONFIG_DIR_NAME, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { selectAgentModelRef, type ModelSelection } from "../lib/current-model.js";
import { getPibarmSettings } from "../lib/pibarm-settings.js";
import { finishAgentTask, removeAgentTask, upsertAgentTask, updateTaskWidget } from "../lib/task-widget.js";

const WORKSPACE_PREFIX = "butty";
const HEADLESS_SUBAGENT_TOOLS = new Set(["run_subagent", "run_subagents"]);
const AUTO_BUTTY_TOOLS = ["butty_spawn", "butty_capture", "butty_join", "butty_list", "butty_kill"];

export function routeSubagentsToButty(activeTools: string[]) {
  return [...new Set([...activeTools.filter((tool) => !HEADLESS_SUBAGENT_TOOLS.has(tool)), ...AUTO_BUTTY_TOOLS])];
}

const SPAWN_PARAMS = Type.Object({
  role: Type.String({ description: "Agent role/name, e.g. scout, planner, worker, reviewer" }),
  task: Type.String({ description: "Task or prompt for the agent" }),
  model: Type.Optional(
    Type.String({
      description:
        "Optional pi model. Defaults to the current active model, with a lighter available model for simple tasks.",
    }),
  ),
  tools: Type.Optional(Type.Array(Type.String(), { description: "Optional tool allowlist for the agent" })),
  worktree: Type.Optional(
    Type.Boolean({ description: "Run in a new git worktree when this agent needs an isolated branch" }),
  ),
  placement: Type.Optional(
    Type.String({
      description: "Where to open it: right, down, tab, or window. Current-tab agents form a bottom row.",
    }),
  ),
});

const CAPTURE_PARAMS = Type.Object({
  role: Type.Optional(Type.String({ description: "Agent role/name. Omit to capture all known agents" })),
  lines: Type.Optional(Type.Number({ description: "Number of recent pane lines to capture. Defaults to 80" })),
});

const JOIN_PARAMS = Type.Object({
  role: Type.Optional(
    Type.String({ description: "Agent role/name. Omit or use all to wait for all known Butty agents" }),
  ),
  timeoutMs: Type.Optional(
    Type.Number({ description: "Maximum time to wait in milliseconds. Defaults to 10 minutes" }),
  ),
  kill: Type.Optional(Type.Boolean({ description: "Kill panes after they finish. Defaults to true" })),
});

const KILL_PARAMS = Type.Object({
  role: Type.Optional(
    Type.String({ description: "Agent role/name. Omit or use all to kill tracked Butty agent panes" }),
  ),
});

const ATTACH_PARAMS = Type.Object({});

const ROLE_DEFAULTS: Record<string, { tools?: string[] }> = {
  scout: { tools: ["read", "grep", "find", "ls", "bash"] },
  planner: { tools: ["read", "grep", "find", "ls", "bash"] },
  worker: {},
  reviewer: { tools: ["read", "grep", "find", "ls", "bash"] },
};

// Butty agents run `pi -p` with no UI, so tools that block on user input can
// never be answered there — strip them from every allowlist.
const INTERACTIVE_ONLY_TOOLS = new Set(["question", "elicit_plan_questions"]);

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
  exited?: number;
  parentTab: boolean;
};

type WeztermPane = {
  pane_id: number;
  tab_id: number;
  window_id: number;
  workspace?: string;
  tab_title?: string;
  title?: string;
};

const BUTTY_HELP = `Butty is a WezTerm-native cockpit for visible parent-controlled agents.

When to use it:
- use Butty when you want to watch agents run in WezTerm tabs or splits
- Butty keeps the parent Pi pane full-width above a row of up to three agents
- a fourth agent requires confirmation and opens in a new window
- Butty agents run non-interactively and auto-exit when their task is done
- use run_subagent/run_subagents for headless one-shot checks
- set pibarm.butty.autoSpawn=true to route those isolated delegations through Butty automatically
- use worktrees for separate branch/risky worker changes
- use the current checkout for same-branch distributed work

Common flow:
1. /butty-attach
2. /butty-spawn scout map the relevant code
3. /butty-spawn planner propose a small safe plan
4. /butty-join
5. Review the returned logs

Agents run non-interactively (pi -p) and cannot receive input mid-run; to give
new instructions, join the agent and spawn a follow-up with the extra context.

Commands:
/butty <task>                 start scout + planner in split panes
/butty-attach                 focus a Butty agent or the parent WezTerm pane
/butty-spawn <role> <task>    spawn scout/planner/worker/reviewer
/butty-capture [role]         read pane/log output
/butty-join [role|all]        wait for agents, summarize, and clean up their panes
/butty-list                   list session workspace agents/panes
/butty-kill [role|all]        force-kill this session's Butty panes
/butty-kill-orphans           kill Butty panes left behind by other sessions`;

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "agent"
  );
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
  const result = await pi.exec("wezterm", ["cli", ...args], { timeout });
  return { stdout: result.stdout?.trim() ?? "", stderr: result.stderr?.trim() ?? "", code: result.code };
}

async function openWorkspaceClient(pi: ExtensionAPI, workspace: string) {
  const workspaceArg = shellQuote(workspace);
  await pi
    .exec(
      "bash",
      [
        "-lc",
        `(wezterm connect unix --workspace ${workspaceArg} >/dev/null 2>&1 || wezterm start --workspace ${workspaceArg} >/dev/null 2>&1) &`,
      ],
      { timeout: 1000 },
    )
    .catch(() => undefined);
}

async function hasWorkspaceClient(pi: ExtensionAPI, workspace: string) {
  const result = await wezterm(pi, ["list-clients", "--format", "json"], 5000);
  if (result.code !== 0) return false;
  try {
    const clients = JSON.parse(result.stdout) as Array<{ workspace?: string }>;
    if (!clients.length) return false;
    // Older wezterm builds omit the workspace field on clients; fall back to
    // treating any attached client as good enough rather than opening extras.
    if (clients.every((client) => client.workspace === undefined)) return true;
    return clients.some((client) => client.workspace === workspace);
  } catch {
    return false;
  }
}

async function ensureWorkspaceClient(pi: ExtensionAPI, workspace: string) {
  // Open a window for THIS session's workspace when none is showing it —
  // an unrelated WezTerm window must not stop the Butty window appearing —
  // but never background extra clients when one is already attached to it.
  if (await hasWorkspaceClient(pi, workspace)) return;
  await openWorkspaceClient(pi, workspace);
}

async function ensureWeztermServer(pi: ExtensionAPI, workspace: string) {
  if ((await wezterm(pi, ["list"], 5000)).code === 0) return;
  // Cold start: wezterm cli needs a running GUI/mux server, so boot a client
  // first and wait until the socket answers before issuing cli commands.
  await openWorkspaceClient(pi, workspace);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await sleep(500);
    if ((await wezterm(pi, ["list"], 5000)).code === 0) return;
  }
  throw new Error("WezTerm is not reachable. Start WezTerm (or its mux server) and retry.");
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

function fallbackWorkspaceName(ctx: ExtensionContext) {
  const project = slug(basename(ctx.cwd));
  const session = slug(ctx.sessionManager.getSessionId()).slice(0, 8);
  return `${WORKSPACE_PREFIX}-${project}-${session}`;
}

function isButtyWorkspace(value: string | undefined) {
  return value === WORKSPACE_PREFIX || Boolean(value?.startsWith(`${WORKSPACE_PREFIX}-`));
}

async function buttyTarget(pi: ExtensionAPI, ctx: ExtensionContext) {
  const hostPane = process.env.WEZTERM_PANE;
  const host = hostPane ? (await listWeztermPanes(pi)).find((pane) => String(pane.pane_id) === hostPane) : undefined;
  return host
    ? { hostPane, workspace: host.workspace ?? "default", attached: true }
    : { hostPane: "", workspace: fallbackWorkspaceName(ctx), attached: false };
}

async function workspacePanes(pi: ExtensionAPI, workspace: string) {
  return (await listWeztermPanes(pi)).filter((pane) => pane.workspace === workspace);
}

async function allButtyPanes(pi: ExtensionAPI) {
  return (await listWeztermPanes(pi)).filter((pane) => isButtyWorkspace(pane.workspace));
}

async function resolveTargetPane(
  pi: ExtensionAPI,
  workspaceName: string,
  lastPane: string,
  panes: Map<string, AgentPane>,
  hostPane = "",
) {
  const workspace = await workspacePanes(pi, workspaceName);
  const ids = new Set(workspace.map((pane) => String(pane.pane_id)));
  if (lastPane && ids.has(lastPane)) return lastPane;
  const recentKnown = Array.from(panes.values())
    .reverse()
    .find((pane) => ids.has(pane.pane));
  if (recentKnown) return recentKnown.pane;
  return hostPane && ids.has(hostPane) ? hostPane : workspace[0] ? String(workspace[0].pane_id) : "";
}

async function gitRoot(pi: ExtensionAPI, cwd: string) {
  const result = await pi.exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { timeout: 10000 });
  return result.code === 0 && result.stdout.trim() ? result.stdout.trim() : cwd;
}

async function buttyStatePaths(pi: ExtensionAPI, cwd: string, role: string) {
  const root = await gitRoot(pi, cwd);
  const dir = join(root, CONFIG_DIR_NAME, "butty");
  await mkdir(dir, { recursive: true });
  const run = `${slug(role)}-${Date.now()}`;
  return { logPath: join(dir, `${run}.log`), statusPath: join(dir, `${run}.status`) };
}

async function maybeWorktree(pi: ExtensionAPI, cwd: string, role: string) {
  const root = await gitRoot(pi, cwd);
  // Unique per run: silently reusing a previous run's worktree mixes old
  // diffs into new tasks, and a leftover branch without its directory made
  // `worktree add -b` fail with a raw git error.
  const run = `${slug(role)}-${Date.now()}`;
  const path = join(root, CONFIG_DIR_NAME, "wt", `butty-${run}`);
  const branch = `butty/${run}`;
  await mkdir(join(root, CONFIG_DIR_NAME, "wt"), { recursive: true });
  const result = await pi.exec("git", ["-C", root, "worktree", "add", "-b", branch, path, "HEAD"], { timeout: 30000 });
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || "git worktree add failed");
  return path;
}

function agentPrompt(role: string, task: string, worktree?: string) {
  const scope = worktree
    ? `Work only in this git worktree: ${worktree}`
    : "Use the current checkout. Do not create branches/worktrees unless asked.";
  return `You are Butty ${role}. ${scope}\n\nYou run non-interactively: nobody can answer questions mid-run. If anything is unclear, state your assumptions and end your final output with any open questions.\n\nTask:\n${task}`;
}

function rendererPath() {
  return fileURLToPath(new URL("../scripts/butty-render.mjs", import.meta.url));
}

function commandFor(
  role: string,
  task: string,
  model: string | undefined,
  tools: string[] | undefined,
  worktree: string | undefined,
  logPath: string,
  statusPath: string,
) {
  // JSON event mode + a local renderer: print mode (-p) emits nothing until
  // the run ends, but the whole point of a pane is watching reasoning, text,
  // and tool activity stream live.
  const args = ["pi", "--name", `butty-${role}`, "--mode", "json", "--no-session"];
  if (model) args.push("--model", model);
  if (tools?.length) args.push("--tools", tools.join(","));
  args.push(agentPrompt(role, task, worktree));

  const piCommand = args.map(shellQuote).join(" ");
  const renderCommand = `${shellQuote("node")} ${shellQuote(rendererPath())}`;
  const script = [
    `: > ${shellQuote(logPath)}`,
    `printf '%s\\n' ${shellQuote(`[butty ${role} started]`)}`,
    `printf '%s\\n' ${shellQuote(`model: ${model ?? "default"}`)}`,
    `printf '%s\\n' ${shellQuote(`log: ${logPath}`)}`,
    `printf '%s\\n' ${shellQuote(`[butty ${role} started]`)} >> ${shellQuote(logPath)}`,
    "set -o pipefail",
    `${piCommand} 2>&1 | ${renderCommand} | tee -a ${shellQuote(logPath)}`,
    "code=${PIPESTATUS[0]}",
    `printf '\\n[butty ${role} exited %s]\\n' "$code" | tee -a ${shellQuote(logPath)}`,
    `printf '%s\\n' "$code" > ${shellQuote(statusPath)}`,
    'exit "$code"',
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

export default function buttyExtension(pi: ExtensionAPI) {
  const panes = new Map<string, AgentPane>();
  let lastPane = "";
  let overflowPane = "";
  let overflowApproved = false;
  let spawnQueue: Promise<void> = Promise.resolve();

  // Reconcile finished agents even when butty_join is never called, so pills
  // don't show "running" forever and the footer count stays honest.
  async function sweepPanes(ctx: ExtensionContext) {
    let changed = false;
    for (const pane of panes.values()) {
      if (pane.exited !== undefined) continue;
      const status = await readStatus(pane);
      if (status === undefined) continue;
      pane.exited = status;
      finishAgentTask(
        `butty:${pane.role}`,
        status === 0 ? "done" : "failed",
        status === 0 ? undefined : `exit ${status}`,
      );
      changed = true;
    }
    if (changed) updateTaskWidget(ctx);
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
    if (matches.length > 1)
      throw new Error(`Ambiguous Butty agent: ${role}. Use one of: ${matches.map((pane) => pane.role).join(", ")}`);
    return undefined;
  }

  async function spawn(
    ctx: ExtensionContext,
    params: { role: string; task: string; model?: string; tools?: string[]; worktree?: boolean; placement?: string },
  ) {
    const queued = spawnQueue.then(() => spawnNow(ctx, params));
    spawnQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  async function spawnNow(
    ctx: ExtensionContext,
    params: { role: string; task: string; model?: string; tools?: string[]; worktree?: boolean; placement?: string },
  ) {
    const requestedPlace = placement(params.placement);
    const target = await buttyTarget(pi, ctx);
    await ensureWeztermServer(pi, target.workspace);
    const liveIds = new Set((await workspacePanes(pi, target.workspace)).map((pane) => String(pane.pane_id)));
    const liveTrackedPanes = Array.from(panes.values()).filter((pane) => liveIds.has(pane.pane));
    if (!liveTrackedPanes.length) {
      overflowPane = "";
      overflowApproved = false;
    }
    const parentPanes = liveTrackedPanes.filter((pane) => pane.parentTab);
    let targetPane = "";
    let place = requestedPlace;
    let parentTab = false;
    let openNewWindow = requestedPlace === "window";
    let overflowWindow = false;

    if (requestedPlace === "tab") {
      targetPane = await resolveTargetPane(pi, target.workspace, lastPane, panes, target.hostPane);
    } else if (target.attached && requestedPlace !== "window") {
      const liveOverflowPane = overflowPane && liveIds.has(overflowPane) ? overflowPane : "";
      if (overflowApproved) {
        targetPane = liveOverflowPane;
        openNewWindow = !targetPane;
        place = openNewWindow ? "window" : "right";
        overflowWindow = true;
      } else if (parentPanes.length >= 3) {
        if (!ctx.hasUI) throw new Error("More than 3 Butty agents requires confirmation in an interactive Pi session.");
        const approved = await ctx.ui.confirm(
          "Open Butty window?",
          "You are requesting more than 3 agents. Continue in a new window?",
        );
        if (!approved) throw new Error("Butty spawn cancelled; the parent tab still has 3 agents.");
        overflowApproved = true;
        openNewWindow = true;
        place = "window";
        overflowWindow = true;
      } else {
        const previous = parentPanes.at(-1);
        targetPane = previous?.pane ?? target.hostPane ?? "";
        place = previous ? "right" : "down";
        parentTab = true;
      }
    } else if (!openNewWindow) {
      targetPane = await resolveTargetPane(pi, target.workspace, lastPane, panes, target.hostPane);
      openNewWindow = !targetPane;
      if (openNewWindow) place = "window";
    }

    const baseRole = slug(params.role);
    const role = uniqueRole(baseRole);
    const defaults = ROLE_DEFAULTS[baseRole] ?? ROLE_DEFAULTS.worker;
    const worktree = params.worktree ? await maybeWorktree(pi, ctx.cwd, role) : undefined;
    const cwd = worktree ?? ctx.cwd;
    const modelSelection = selectAgentModelRef(ctx, params.model, params.task);
    const model = modelSelection.model;
    const tools = (params.tools ?? defaults.tools)?.filter((tool) => !INTERACTIVE_ONLY_TOOLS.has(tool));
    // State paths must resolve against the parent checkout: inside a worktree
    // they would pollute the agent's diff and vanish with the worktree.
    const { logPath, statusPath } = await buttyStatePaths(pi, ctx.cwd, role);
    const command = commandFor(role, params.task, model, tools, worktree, logPath, statusPath);
    const args = openNewWindow
      ? ["spawn", "--new-window", "--workspace", target.workspace, "--cwd", cwd, "--", ...command]
      : place === "tab"
        ? ["spawn", "--pane-id", targetPane, "--cwd", cwd, "--", ...command]
        : [
            "split-pane",
            "--pane-id",
            targetPane,
            place === "down" ? "--bottom" : "--right",
            "--cwd",
            cwd,
            "--",
            ...command,
          ];

    const result = await wezterm(pi, args, 15000);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "wezterm spawn failed");
    const paneId = result.stdout;
    // split-pane focuses the child; give input back to Pi before any further bookkeeping.
    if (target.hostPane && requestedPlace !== "window")
      await wezterm(pi, ["activate-pane", "--pane-id", target.hostPane]).catch(() => undefined);
    if (!target.attached) await ensureWorkspaceClient(pi, target.workspace);
    if (overflowWindow) overflowPane = paneId;
    lastPane = paneId;
    panes.set(role, {
      role,
      pane: paneId,
      workspace: target.workspace,
      cwd,
      model,
      modelSelection,
      tools,
      worktree,
      placement: place,
      logPath,
      statusPath,
      parentTab,
    });
    upsertAgentTask({
      id: `butty:${role}`,
      label: `butty ${role}`,
      status: "running",
      session: target.workspace,
    });
    updateTaskWidget(ctx);
    return panes.get(role)!;
  }

  async function capture(role: string | undefined, lines = 80) {
    const targets = role ? ([paneFor(role)].filter(Boolean) as AgentPane[]) : Array.from(panes.values());
    if (!targets.length) throw new Error(role ? `Unknown Butty agent: ${role}` : "No Butty agents known");
    const blocks = [];
    for (const pane of targets) {
      const result = await wezterm(
        pi,
        ["get-text", "--pane-id", pane.pane, "--start-line", `-${Math.max(1, lines)}`],
        10000,
      );
      const log = result.code === 0 && result.stdout ? result.stdout : await readLog(pane, lines);
      const status = await readStatus(pane);
      blocks.push(`## ${pane.role}${status !== undefined ? ` (exited ${status})` : ""}\n${log || result.stderr}`);
    }
    return blocks.join("\n\n---\n\n");
  }

  async function attach(ctx: ExtensionContext) {
    const target = await buttyTarget(pi, ctx);
    await ensureWeztermServer(pi, target.workspace);
    const existing = await resolveTargetPane(pi, target.workspace, lastPane, panes, target.hostPane);
    if (existing) {
      if (!target.attached) await ensureWorkspaceClient(pi, target.workspace);
      await wezterm(pi, ["activate-pane", "--pane-id", existing]).catch(() => undefined);
      return existing;
    }
    const result = await wezterm(
      pi,
      ["spawn", "--new-window", "--workspace", target.workspace, "--cwd", ctx.cwd],
      15000,
    );
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "wezterm spawn failed");
    await ensureWorkspaceClient(pi, target.workspace);
    await wezterm(pi, ["activate-pane", "--pane-id", result.stdout]).catch(() => undefined);
    return result.stdout || "opened";
  }

  async function joinAgents(
    ctx: ExtensionContext,
    role?: string,
    timeoutMs = 600000,
    killDone = true,
    signal?: AbortSignal,
  ) {
    const targets =
      !role || role === "all" ? Array.from(panes.values()) : ([paneFor(role)].filter(Boolean) as AgentPane[]);
    if (!targets.length)
      throw new Error(role && role !== "all" ? `Unknown Butty agent: ${role}` : "No Butty agents known");

    const deadline = Date.now() + Math.max(0, timeoutMs);
    while (Date.now() <= deadline) {
      if (signal?.aborted) {
        const statuses = await Promise.all(targets.map(readStatus));
        const pending = targets.filter((_pane, index) => statuses[index] === undefined).map((pane) => pane.role);
        return `Cancelled while waiting for: ${pending.join(", ") || "(none)"}. Panes were left running; use butty_join again or butty_kill to clean up.`;
      }
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
      finishAgentTask(
        `butty:${pane.role}`,
        status === 0 ? "done" : "failed",
        status === 0 ? undefined : `exit ${status}`,
      );
      if (killDone) await wezterm(pi, ["kill-pane", "--pane-id", pane.pane]).catch(() => undefined);
      panes.delete(pane.role);
    }

    if (lastPane && !Array.from(panes.values()).some((pane) => pane.pane === lastPane)) lastPane = "";
    if (!panes.size) {
      overflowPane = "";
      overflowApproved = false;
    }
    updateTaskWidget(ctx);
    return `${stillRunning.length ? `Timed out waiting for: ${stillRunning.join(", ")}\n\n` : ""}${blocks.join("\n\n---\n\n")}`;
  }

  async function kill(ctx: ExtensionContext, role?: string) {
    if (!role || role === "all") {
      for (const pane of panes.values())
        await wezterm(pi, ["kill-pane", "--pane-id", pane.pane]).catch(() => undefined);
      for (const pane of panes.values()) removeAgentTask(`butty:${pane.role}`);
      panes.clear();
      lastPane = "";
      overflowPane = "";
      overflowApproved = false;
      updateTaskWidget(ctx);
      return "Butty panes killed.";
    }
    const pane = paneFor(role);
    if (!pane) return `Unknown Butty agent: ${role}`;
    await wezterm(pi, ["kill-pane", "--pane-id", pane.pane]).catch(() => undefined);
    panes.delete(pane.role);
    removeAgentTask(`butty:${pane.role}`);
    if (lastPane === pane.pane) lastPane = "";
    updateTaskWidget(ctx);
    return `Killed ${pane.role}.`;
  }

  async function killOrphans(ctx: ExtensionContext) {
    const target = await buttyTarget(pi, ctx);
    const known = new Set(Array.from(panes.values()).map((pane) => pane.pane));
    const orphans = (await allButtyPanes(pi)).filter(
      (pane) => pane.workspace !== target.workspace && !known.has(String(pane.pane_id)),
    );
    for (const pane of orphans)
      await wezterm(pi, ["kill-pane", "--pane-id", String(pane.pane_id)]).catch(() => undefined);
    return orphans.length
      ? `Killed ${orphans.length} orphaned Butty pane(s) outside workspace ${target.workspace}.`
      : "No orphaned Butty panes found.";
  }

  pi.registerCommand("butty-help", {
    description: "Explain Butty WezTerm agent orchestration",
    handler: async (_args, ctx) => ctx.ui.notify(BUTTY_HELP, "info"),
  });

  pi.registerCommand("butty", {
    description: "Start a WezTerm Butty with scout and planner agents for a task",
    handler: async (args, ctx) => {
      const task = args.trim();
      if (!task) return ctx.ui.notify("Usage: /butty <task>", "warning");
      try {
        await spawn(ctx, { role: "scout", task, placement: "down" });
        await spawn(ctx, { role: "planner", task, placement: "right" });
        ctx.ui.notify("Butty ready in WezTerm", "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("butty-attach", {
    description: "Focus a Butty agent or the parent WezTerm pane",
    handler: async (_args, ctx) => {
      try {
        ctx.ui.notify(`WezTerm pane: ${await attach(ctx)}`, "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("butty-spawn", {
    description: "Spawn one Butty agent: /butty-spawn <role> <task>",
    handler: async (args, ctx) => {
      const [role, ...rest] = args.trim().split(/\s+/);
      if (!role || rest.length === 0) return ctx.ui.notify("Usage: /butty-spawn <role> <task>", "warning");
      try {
        const pane = await spawn(ctx, { role, task: rest.join(" ") });
        ctx.ui.notify(`Spawned ${pane.role} in ${pane.pane}`, "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("butty-capture", {
    description: "Capture Butty output: /butty-capture [role]",
    handler: async (args, ctx) => {
      try {
        ctx.ui.notify(await capture(args.trim() || undefined), "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("butty-join", {
    description: "Wait for Butty agents, summarize, and clean up their panes: /butty-join [role|all]",
    handler: async (args, ctx) => {
      try {
        ctx.ui.notify(await joinAgents(ctx, args.trim() || undefined), "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("butty-list", {
    description: "List Butty agents and panes for this session",
    handler: async (_args, ctx) => {
      try {
        const target = await buttyTarget(pi, ctx);
        const agents = Array.from(panes.values()).filter((pane) => pane.workspace === target.workspace);
        const lines = [
          `workspace: ${target.workspace}`,
          `parent: ${target.hostPane || "(separate Butty window)"}`,
          ...agents.map(
            (pane) =>
              `${pane.role}: ${pane.pane} ${pane.model ?? "(default model)"}${pane.worktree ? ` (${pane.worktree})` : ""}`,
          ),
        ];
        ctx.ui.notify(lines.join("\n"), "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("butty-kill", {
    description: "Kill this session's Butty panes: /butty-kill [role|all]",
    handler: async (args, ctx) => {
      try {
        ctx.ui.notify(await kill(ctx, args.trim() || undefined), "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("butty-kill-orphans", {
    description: "Kill Butty panes left behind by other sessions' workspaces",
    handler: async (_args, ctx) => {
      try {
        ctx.ui.notify(await killOrphans(ctx), "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  async function applyAutomaticRouting(ctx: ExtensionContext) {
    if (ctx.mode !== "tui" || (await getPibarmSettings(ctx)).butty?.autoSpawn !== true) return false;
    const active = pi.getActiveTools();
    const routed = routeSubagentsToButty(active);
    if (active.join("\n") !== routed.join("\n")) pi.setActiveTools(routed);
    return true;
  }

  pi.on("session_start", async (_event, ctx) => {
    await applyAutomaticRouting(ctx);
  });
  pi.on("before_agent_start", async (event, ctx) => {
    if (!(await applyAutomaticRouting(ctx))) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\nButty auto-spawn is enabled. Use butty_spawn instead of run_subagent/run_subagents for isolated delegation, and butty_join when results are needed. Leave worktree agents and watchers unchanged.`,
    };
  });
  pi.on("turn_end", async (_event, ctx) => sweepPanes(ctx));

  pi.registerTool({
    name: "butty_spawn",
    label: "Butty Spawn",
    description: "Spawn a parent-controlled pi agent in a WezTerm Butty pane. The pane exits when the agent finishes.",
    parameters: SPAWN_PARAMS,
    async execute(_id, params, _signal, _update, ctx) {
      const pane = await spawn(ctx, params);
      return {
        content: [
          {
            type: "text",
            text: `Spawned ${pane.role} in ${pane.pane}${pane.worktree ? `\nWorktree: ${pane.worktree}` : ""}`,
          },
        ],
        details: pane,
      };
    },
  });

  pi.registerTool({
    name: "butty_attach",
    label: "Butty Attach",
    description: "Focus a Butty agent pane or the parent WezTerm pane.",
    parameters: ATTACH_PARAMS,
    async execute(_id, _params, _signal, _update, ctx) {
      const pane = await attach(ctx);
      const target = await buttyTarget(pi, ctx);
      return {
        content: [{ type: "text", text: `WezTerm pane: ${pane}` }],
        details: { pane, workspace: target.workspace },
      };
    },
  });

  pi.registerTool({
    name: "butty_capture",
    label: "Butty Capture",
    description: "Capture recent output from one or all Butty WezTerm panes/logs.",
    parameters: CAPTURE_PARAMS,
    async execute(_id, params) {
      const text = await capture(params.role, params.lines ?? 80);
      return { content: [{ type: "text", text }], details: { role: params.role, lines: params.lines ?? 80 } };
    },
  });

  pi.registerTool({
    name: "butty_join",
    label: "Butty Join",
    description: "Wait for one or all Butty agents to finish, capture logs, and clean up their panes.",
    parameters: JOIN_PARAMS,
    async execute(_id, params, signal, _update, ctx) {
      const text = await joinAgents(ctx, params.role, params.timeoutMs ?? 600000, params.kill ?? true, signal);
      return {
        content: [{ type: "text", text }],
        details: { role: params.role, timeoutMs: params.timeoutMs ?? 600000, kill: params.kill ?? true },
      };
    },
  });

  pi.registerTool({
    name: "butty_list",
    label: "Butty List",
    description: "List tracked Butty agents in the parent WezTerm workspace.",
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _update, ctx) {
      const target = await buttyTarget(pi, ctx);
      const agents = Array.from(panes.values()).filter((pane) => pane.workspace === target.workspace);
      const lines = agents.map(
        (pane) =>
          `${pane.role}: ${pane.pane} ${pane.model ?? "(default model)"}${pane.worktree ? ` (${pane.worktree})` : ""}`,
      );
      const text = lines.length ? lines.join("\n") : "No Butty agents.";
      return {
        content: [{ type: "text", text }],
        details: { workspace: target.workspace, parentPane: target.hostPane, agents },
      };
    },
  });

  pi.registerTool({
    name: "butty_kill",
    label: "Butty Kill",
    description: "Kill one or all tracked Butty agent panes without touching the parent workspace.",
    parameters: KILL_PARAMS,
    async execute(_id, params, _signal, _update, ctx) {
      const text = await kill(ctx, params.role);
      return { content: [{ type: "text", text }], details: { role: params.role } };
    },
  });
}
