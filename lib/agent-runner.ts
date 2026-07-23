import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_DIR_NAME, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { paneSlug, type AgentPaneAdapter, type MultiplexerKind } from "./agent-pane-adapter.js";
import { getPibarmSettings, type AgentPanesSettings } from "./pibarm-settings.js";
import { TmuxAgentPaneAdapter } from "./tmux-agent-pane.js";
import { clipTail } from "./tool-output.js";
import { ZellijAgentPaneAdapter } from "./zellij-agent-pane.js";

export type AgentRunKind = "subagent" | "worktree";

export interface AgentRunOptions {
  id: string;
  prompt: string;
  kind: AgentRunKind;
  cwd: string;
  stateCwd?: string;
  model?: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface AgentRunResult {
  code: number;
  stdout: string;
  stderr: string;
  renderer: "headless" | MultiplexerKind;
  pane?: string;
  logPath?: string;
  attachCommand?: string;
}

export interface NormalizedAgentPanesSettings {
  enabled: boolean;
  include: AgentRunKind[];
  multiplexer: "auto" | MultiplexerKind;
  outsideMultiplexer: "detached" | "headless";
}

export function normalizeAgentPanesSettings(settings: AgentPanesSettings = {}): NormalizedAgentPanesSettings {
  const include: AgentRunKind[] = Array.isArray(settings.include)
    ? settings.include.filter((kind): kind is AgentRunKind => kind === "subagent" || kind === "worktree")
    : ["subagent", "worktree"];
  return {
    enabled: settings.enabled !== false,
    include: [...new Set(include)],
    multiplexer: settings.multiplexer === "tmux" || settings.multiplexer === "zellij" ? settings.multiplexer : "auto",
    outsideMultiplexer: settings.outsideMultiplexer === "headless" ? "headless" : "detached",
  };
}

export function multiplexerCandidates(
  policy: NormalizedAgentPanesSettings,
  env: Partial<Pick<NodeJS.ProcessEnv, "TMUX" | "TMUX_PANE" | "ZELLIJ_SESSION_NAME">> = process.env,
): MultiplexerKind[] {
  if (policy.multiplexer !== "auto") return [policy.multiplexer];
  if (env.ZELLIJ_SESSION_NAME) return ["zellij"];
  if (env.TMUX && env.TMUX_PANE) return ["tmux"];
  return ["tmux", "zellij"];
}

function insideMultiplexer() {
  return Boolean(process.env.ZELLIJ_SESSION_NAME || (process.env.TMUX && process.env.TMUX_PANE));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scriptPath(name: string) {
  return fileURLToPath(new URL(`../scripts/${name}`, import.meta.url));
}

function paneCommand(options: AgentRunOptions, logPath: string, statusPath: string) {
  const id = paneSlug(options.id);
  const command = ["pi", "--name", `agent-${id}`, "--mode", "json", "--no-session"];
  if (options.model) command.push("--model", options.model);
  command.push(options.prompt);
  return [
    "bash",
    scriptPath("agent-run.sh"),
    process.env.PATH ?? "",
    id,
    logPath,
    statusPath,
    process.execPath,
    scriptPath("agent-render.mjs"),
    ...command,
  ];
}

async function readStatus(path: string): Promise<number | undefined> {
  try {
    const raw = (await readFile(path, "utf8")).trim();
    return /^-?\d+$/.test(raw) ? Number(raw) : undefined;
  } catch {
    return undefined;
  }
}

async function readLog(path: string, lines = 2_000) {
  try {
    return clipTail((await readFile(path, "utf8")).split("\n").slice(-Math.max(1, lines)).join("\n"));
  } catch {
    return "";
  }
}

type AgentRecord = {
  id: string;
  pane: string;
  logPath: string;
  renderer: MultiplexerKind;
  state: "running" | "done" | "failed";
  code?: number;
};

class ChildAgentRunner {
  private unavailableNoticeShown = false;
  private readonly attachNotices = new Set<MultiplexerKind>();
  private readonly adapters: Record<MultiplexerKind, AgentPaneAdapter>;
  private paneQueue: Promise<void> = Promise.resolve();
  private readonly records = new Map<string, AgentRecord>();

  constructor(private readonly pi: ExtensionAPI) {
    this.adapters = {
      tmux: new TmuxAgentPaneAdapter(pi),
      zellij: new ZellijAgentPaneAdapter(pi),
    };
    pi.registerCommand("agents", {
      description: "List managed agents or capture one agent log: /agents [name]",
      handler: async (args, ctx) => this.listOrCapture(args.trim(), ctx),
    });
    pi.registerCommand("agents-attach", {
      description: "Focus or show how to attach to managed agent panes",
      handler: async (_args, ctx) => this.attach(ctx),
    });
    pi.registerCommand("agents-kill", {
      description: "Kill managed agents: /agents-kill [name|all]",
      handler: async (args, ctx) => this.kill(args.trim() || "all", ctx),
    });
    pi.on("session_shutdown", async () => {
      await this.killRunning();
      await Promise.all(Object.values(this.adapters).map((adapter) => adapter.shutdown()));
    });
  }

  async run(options: AgentRunOptions, ctx: ExtensionContext): Promise<AgentRunResult> {
    const policy = normalizeAgentPanesSettings((await getPibarmSettings(ctx)).agentPanes);
    const adapter = await this.selectAdapter(policy, options.kind, ctx);
    if (!adapter) return this.headless(options);
    try {
      return await this.pane(options, ctx, adapter);
    } catch (error) {
      if (ctx.hasUI)
        ctx.ui.notify(
          `${adapter.kind} agent panes unavailable; using headless mode: ${(error as Error).message}`,
          "warning",
        );
      return this.headless(options);
    }
  }

  private async selectAdapter(
    policy: NormalizedAgentPanesSettings,
    kind: AgentRunKind,
    ctx: ExtensionContext,
  ): Promise<AgentPaneAdapter | undefined> {
    if (!policy.enabled || !policy.include.includes(kind)) return;
    if (!insideMultiplexer() && policy.outsideMultiplexer === "headless") return;
    for (const candidate of multiplexerCandidates(policy)) {
      const adapter = this.adapters[candidate];
      if (await adapter.available()) return adapter;
    }
    if (!this.unavailableNoticeShown && ctx.hasUI) {
      this.unavailableNoticeShown = true;
      ctx.ui.notify("No compatible tmux or Zellij installation found; agents will run headlessly", "warning");
    }
  }

  private async headless(options: AgentRunOptions): Promise<AgentRunResult> {
    const args = ["-p"];
    if (options.model) args.push("--model", options.model);
    args.push(options.prompt);
    const result = await this.pi.exec("pi", args, {
      cwd: options.cwd,
      signal: options.signal,
      timeout: options.timeoutMs,
    });
    return {
      code: result.code ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      renderer: "headless",
    };
  }

  private async pane(
    options: AgentRunOptions,
    ctx: ExtensionContext,
    adapter: AgentPaneAdapter,
  ): Promise<AgentRunResult> {
    const id = this.uniqueId(options.id);
    const root = await this.gitRoot(options.stateCwd ?? options.cwd);
    const stateDir = join(root, CONFIG_DIR_NAME, "agents");
    await mkdir(stateDir, { recursive: true });
    const run = `${paneSlug(id)}-${Date.now()}`;
    const logPath = join(stateDir, `${run}.log`);
    const statusPath = join(stateDir, `${run}.status`);
    const pane = await this.createPane(adapter, { ...options, id }, logPath, statusPath, ctx);
    const record: AgentRecord = { id, pane, logPath, renderer: adapter.kind, state: "running" };
    this.records.set(id, record);

    const deadline = Date.now() + Math.max(0, options.timeoutMs);
    let code: number | undefined;
    while (Date.now() <= deadline) {
      if (options.signal?.aborted) break;
      code = await readStatus(statusPath);
      if (code !== undefined) break;
      await sleep(250);
    }
    const stopped = code === undefined;
    if (stopped) {
      await adapter.close(pane);
      await sleep(100);
    }
    const exitCode = code ?? 143;
    record.code = exitCode;
    record.state = exitCode === 0 ? "done" : "failed";
    const stdout = await readLog(logPath);
    if (!stopped) await adapter.close(pane);
    return {
      code: exitCode,
      stdout,
      stderr: "",
      renderer: adapter.kind,
      pane,
      logPath,
      attachCommand: adapter.attachCommand(),
    };
  }

  private async createPane(
    adapter: AgentPaneAdapter,
    options: AgentRunOptions,
    logPath: string,
    statusPath: string,
    ctx: ExtensionContext,
  ) {
    const result = this.paneQueue.then(async () => {
      const pane = await adapter.create({
        id: options.id,
        cwd: options.cwd,
        command: paneCommand(options, logPath, statusPath),
        sessionCwd: ctx.cwd,
        sessionId: ctx.sessionManager.getSessionId(),
      });
      const attach = adapter.attachCommand();
      if (attach && !this.attachNotices.has(adapter.kind) && ctx.hasUI) {
        this.attachNotices.add(adapter.kind);
        ctx.ui.notify(`Agents are visible in ${adapter.kind}. Attach with: ${attach}`, "info");
      }
      return pane;
    });
    this.paneQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async gitRoot(cwd: string) {
    const result = await this.pi.exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { timeout: 10_000 });
    return result.code === 0 && result.stdout.trim() ? result.stdout.trim() : cwd;
  }

  private uniqueId(requested: string) {
    const base = paneSlug(requested);
    if (!this.records.has(base)) return base;
    for (let index = 2; index < 1_000; index++) if (!this.records.has(`${base}-${index}`)) return `${base}-${index}`;
    return `${base}-${Date.now()}`;
  }

  private async listOrCapture(requested: string, ctx: ExtensionContext) {
    if (requested) {
      const record = this.findRecord(requested);
      if (!record) return ctx.ui.notify(`Unknown agent: ${requested}`, "warning");
      return ctx.ui.notify((await readLog(record.logPath, 200)) || "(no agent output)", "info");
    }
    const lines = [...this.records.values()].map(
      (record) =>
        `${record.id}: ${record.state}${record.code === undefined ? "" : ` (exit ${record.code})`} · ${record.renderer}`,
    );
    ctx.ui.notify(lines.length ? lines.join("\n") : "No managed agents.", "info");
  }

  private async attach(ctx: ExtensionContext) {
    const record = [...this.records.values()].reverse().find((candidate) => candidate.state === "running");
    if (!record) return ctx.ui.notify("No running managed agent pane.", "warning");
    const adapter = this.adapters[record.renderer];
    if (await adapter.focus(record.pane)) return ctx.ui.notify(`Focused managed ${adapter.kind} agent pane.`, "info");
    const command = adapter.attachCommand();
    ctx.ui.notify(
      command ? `Attach with: ${command}` : `Could not focus ${adapter.kind} agent pane.`,
      command ? "info" : "error",
    );
  }

  private async kill(requested: string, ctx: ExtensionContext) {
    const matches = requested === "all" ? [...this.records.values()] : [this.findRecord(requested)].filter(Boolean);
    const targets = (matches as AgentRecord[]).filter((record) => record.state === "running");
    if (!targets.length) return ctx.ui.notify(`No running managed agent matched: ${requested}`, "warning");
    for (const record of targets) await this.adapters[record.renderer].close(record.pane);
    ctx.ui.notify(`Killed ${targets.length} managed agent(s).`, "info");
  }

  private findRecord(requested: string) {
    const id = paneSlug(requested);
    if (this.records.has(id)) return this.records.get(id);
    const matches = [...this.records.values()].filter((record) => record.id.startsWith(`${id}-`));
    return matches.length === 1 ? matches[0] : undefined;
  }

  private async killRunning() {
    for (const record of this.records.values())
      if (record.state === "running") await this.adapters[record.renderer].close(record.pane);
  }
}

const RUNNERS = new WeakMap<object, ChildAgentRunner>();

export function registerChildAgentRunner(pi: ExtensionAPI) {
  let runner = RUNNERS.get(pi);
  if (!runner) {
    runner = new ChildAgentRunner(pi);
    RUNNERS.set(pi, runner);
  }
  return runner;
}
