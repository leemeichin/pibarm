import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_DIR_NAME, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getPibarmSettings, type AgentPanesSettings } from "./pibarm-settings.js";
import { clipTail } from "./tool-output.js";

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
  renderer: "headless" | "tmux";
  pane?: string;
  logPath?: string;
  attachCommand?: string;
}

export interface NormalizedAgentPanesSettings {
  enabled: "auto" | boolean;
  include: AgentRunKind[];
  outsideTmux: "detached" | "headless";
  layout: "tiled";
}

export function normalizeAgentPanesSettings(settings: AgentPanesSettings = {}): NormalizedAgentPanesSettings {
  const include: AgentRunKind[] = Array.isArray(settings.include)
    ? settings.include.filter((kind): kind is AgentRunKind => kind === "subagent" || kind === "worktree")
    : ["subagent", "worktree"];
  return {
    enabled: settings.enabled === true || settings.enabled === false ? settings.enabled : "auto",
    include: [...new Set(include)],
    outsideTmux: settings.outsideTmux === "headless" ? "headless" : "detached",
    layout: "tiled",
  };
}

export function tmuxControlCommand(args: readonly string[]): string {
  return args.map(shellQuote).join(" ");
}

function slug(value: string, fallback = "agent") {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || fallback
  );
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rendererPath() {
  return fileURLToPath(new URL("../scripts/agent-render.mjs", import.meta.url));
}

const RUN_ENCODED_SCRIPT =
  'const { spawnSync } = require("node:child_process"); const result = spawnSync("bash", ["-lc", Buffer.from(process.argv[1], "base64").toString("utf8")], { stdio: "inherit" }); process.exit(result.status ?? 1);';

function encodedPaneCommand(script: string) {
  return ["node", "-e", RUN_ENCODED_SCRIPT, Buffer.from(script).toString("base64")];
}

function paneScript(options: AgentRunOptions, logPath: string, statusPath: string) {
  const args = ["pi", "--name", `agent-${slug(options.id)}`, "--mode", "json", "--no-session"];
  if (options.model) args.push("--model", options.model);
  args.push(options.prompt);
  const command = args.map(shellQuote).join(" ");
  return [
    `export PATH=${shellQuote(process.env.PATH ?? "")}`,
    `: > ${shellQuote(logPath)}`,
    "code=143",
    `finish() { printf '\\n[agent ${slug(options.id)} exited %s]\\n' "$code" | tee -a ${shellQuote(logPath)}; printf '%s\\n' "$code" > ${shellQuote(statusPath)}; }`,
    "trap finish EXIT",
    `printf '%s\\n' ${shellQuote(`[agent ${slug(options.id)} started]`)} | tee -a ${shellQuote(logPath)}`,
    "set -o pipefail",
    `${command} 2>&1 | ${shellQuote("node")} ${shellQuote(rendererPath())} | tee -a ${shellQuote(logPath)}`,
    "code=${PIPESTATUS[0]}",
    'exit "$code"',
  ].join("; ");
}

async function readStatus(path: string): Promise<number | undefined> {
  try {
    const code = Number((await readFile(path, "utf8")).trim());
    return Number.isFinite(code) ? code : undefined;
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

interface PendingCommand {
  command: string;
  resolve(output: string): void;
  reject(error: Error): void;
}

class TmuxControl {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly queue: PendingCommand[] = [];
  private current?: PendingCommand;
  private response: string[] = [];
  private buffer = "";
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  readonly ready: Promise<void>;

  constructor(
    session: string,
    private readonly onEvent: (line: string) => void,
    private readonly onExit: () => void,
  ) {
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.child = spawn("tmux", ["-C", "attach-session", "-t", session], { stdio: ["pipe", "pipe", "pipe"] });
    this.child.stdout.on("data", (chunk) => this.consume(String(chunk)));
    this.child.stderr.on("data", (chunk) => this.onEvent(String(chunk).trim()));
    this.child.once("error", (error) => {
      this.readyReject(error);
      this.failAll(error);
    });
    this.child.once("exit", () => {
      this.failAll(new Error("tmux control client exited"));
      this.onExit();
    });
    const timer = setTimeout(() => this.readyReject(new Error("tmux control mode did not become ready")), 5_000);
    this.ready.finally(() => clearTimeout(timer)).catch(() => undefined);
  }

  async command(args: readonly string[]): Promise<string> {
    await this.ready;
    return new Promise<string>((resolve, reject) => {
      this.queue.push({ command: tmuxControlCommand(args), resolve, reject });
      this.pump();
    });
  }

  close() {
    this.child.stdin.end();
  }

  private consume(chunk: string) {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) this.line(line.replace(/\r$/, ""));
  }

  private line(line: string) {
    if (line.startsWith("%session-changed")) {
      this.readyResolve();
      this.onEvent(line);
      return;
    }
    if (line.startsWith("%begin")) {
      this.response = [];
      return;
    }
    if (line.startsWith("%end")) {
      const current = this.current;
      this.current = undefined;
      if (current) current.resolve(this.response.join("\n").trim());
      this.response = [];
      this.pump();
      return;
    }
    if (line.startsWith("%error")) {
      const current = this.current;
      this.current = undefined;
      if (current) current.reject(new Error(this.response.join("\n").trim() || "tmux command failed"));
      this.response = [];
      this.pump();
      return;
    }
    if (/^%(?:output|pane-|window-|session-|layout-change|client-|exit)/.test(line)) {
      this.onEvent(line);
      return;
    }
    if (this.current) this.response.push(line);
  }

  private pump() {
    if (this.current || !this.queue.length || this.child.stdin.destroyed) return;
    this.current = this.queue.shift();
    this.child.stdin.write(`${this.current!.command}\n`);
  }

  private failAll(error: Error) {
    this.current?.reject(error);
    this.current = undefined;
    for (const pending of this.queue.splice(0)) pending.reject(error);
  }
}

type AgentRecord = {
  id: string;
  pane: string;
  logPath: string;
  statusPath: string;
  state: "running" | "done" | "failed";
  code?: number;
};

class ChildAgentRunner {
  private tmuxAvailable?: boolean;
  private unavailableNoticeShown = false;
  private attachNoticeShown = false;
  private controller?: TmuxControl;
  private session = "";
  private sessionName = "";
  private window = "";
  private placeholderWindow = "";
  private paneQueue: Promise<void> = Promise.resolve();
  private readonly records = new Map<string, AgentRecord>();

  constructor(private readonly pi: ExtensionAPI) {
    pi.registerCommand("agents", {
      description: "List managed agents or capture one agent log: /agents [name]",
      handler: async (args, ctx) => this.listOrCapture(args.trim(), ctx),
    });
    pi.registerCommand("agents-attach", {
      description: "Show or focus the managed tmux agent window",
      handler: async (_args, ctx) => this.attach(ctx),
    });
    pi.registerCommand("agents-kill", {
      description: "Kill managed agents: /agents-kill [name|all]",
      handler: async (args, ctx) => this.kill(args.trim() || "all", ctx),
    });
    pi.on("session_shutdown", async () => {
      await this.killRunning();
      this.controller?.close();
      if (this.sessionName)
        await this.pi.exec("tmux", ["kill-session", "-t", this.sessionName], { timeout: 5_000 }).catch(() => undefined);
    });
  }

  async run(options: AgentRunOptions, ctx: ExtensionContext): Promise<AgentRunResult> {
    const policy = normalizeAgentPanesSettings((await getPibarmSettings(ctx)).agentPanes);
    if (!(await this.usePane(policy, options.kind, ctx))) return this.headless(options);
    try {
      return await this.pane(options, ctx, policy);
    } catch (error) {
      if (ctx.hasUI)
        ctx.ui.notify(`tmux agent panes unavailable; using headless mode: ${(error as Error).message}`, "warning");
      return this.headless(options);
    }
  }

  private async usePane(policy: NormalizedAgentPanesSettings, kind: AgentRunKind, ctx: ExtensionContext) {
    if (policy.enabled === false || !policy.include.includes(kind)) return false;
    if (!process.env.TMUX && policy.outsideTmux === "headless") return false;
    if (this.tmuxAvailable === undefined) {
      const result = await this.pi.exec("tmux", ["-V"], { timeout: 5_000 });
      this.tmuxAvailable = result.code === 0;
    }
    if (this.tmuxAvailable) return true;
    if (!this.unavailableNoticeShown && ctx.hasUI) {
      this.unavailableNoticeShown = true;
      ctx.ui.notify("tmux is unavailable; agents will run headlessly", "warning");
    }
    return false;
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
    policy: NormalizedAgentPanesSettings,
  ): Promise<AgentRunResult> {
    const id = this.uniqueId(options.id);
    const root = await this.gitRoot(options.stateCwd ?? options.cwd);
    const stateDir = join(root, CONFIG_DIR_NAME, "agents");
    await mkdir(stateDir, { recursive: true });
    const run = `${slug(id)}-${Date.now()}`;
    const logPath = join(stateDir, `${run}.log`);
    const statusPath = join(stateDir, `${run}.status`);
    const pane = await this.createPane({ ...options, id }, logPath, statusPath, ctx, policy);
    const record: AgentRecord = { id, pane, logPath, statusPath, state: "running" };
    this.records.set(id, record);

    const deadline = Date.now() + Math.max(0, options.timeoutMs);
    let code: number | undefined;
    while (Date.now() <= deadline) {
      if (options.signal?.aborted) break;
      code = await readStatus(statusPath);
      if (code !== undefined) break;
      await sleep(250);
    }
    if (code === undefined) {
      await this.keepDetachedSession(pane);
      await this.killPane(pane);
      code = 143;
      await sleep(100);
    }
    record.code = code;
    record.state = code === 0 ? "done" : "failed";
    const stdout = await readLog(logPath);
    await this.keepDetachedSession(pane);
    await this.killPane(pane);
    if (![...this.records.values()].some((item) => item.state === "running" && item.pane !== pane)) this.window = "";
    return {
      code,
      stdout,
      stderr: "",
      renderer: "tmux",
      pane,
      logPath,
      attachCommand: this.sessionName ? `tmux attach -t ${this.sessionName}` : undefined,
    };
  }

  private async createPane(
    options: AgentRunOptions,
    logPath: string,
    statusPath: string,
    ctx: ExtensionContext,
    policy: NormalizedAgentPanesSettings,
  ) {
    let resolvePane!: (pane: string) => void;
    let rejectPane!: (error: Error) => void;
    const result = new Promise<string>((resolve, reject) => {
      resolvePane = resolve;
      rejectPane = reject;
    });
    const queued = this.paneQueue.then(async () => {
      try {
        await this.ensureController(ctx);
        const control = this.controller!;
        const script = paneScript(options, logPath, statusPath);
        let pane = "";
        if (!this.window) {
          const created = await control.command([
            "new-window",
            "-d",
            "-P",
            "-F",
            "#{window_id} #{pane_id}",
            "-t",
            this.session,
            "-n",
            "pibarm-agents",
            "sleep",
            "2147483647",
          ]);
          [this.window, pane] = created.split(/\s+/, 2);
          if (!this.window || !pane) throw new Error(`Unexpected tmux window response: ${created}`);
          await control.command(["set-option", "-w", "-t", this.window, "remain-on-exit", "on"]);
          await control.command(["respawn-pane", "-k", "-c", options.cwd, "-t", pane, ...encodedPaneCommand(script)]);
          if (this.placeholderWindow) {
            await control.command(["kill-window", "-t", this.placeholderWindow]).catch(() => undefined);
            this.placeholderWindow = "";
          }
        } else {
          pane = await control.command([
            "split-window",
            "-d",
            "-P",
            "-F",
            "#{pane_id}",
            "-c",
            options.cwd,
            "-t",
            this.window,
            ...encodedPaneCommand(script),
          ]);
        }
        if (policy.layout === "tiled") await control.command(["select-layout", "-t", this.window, "tiled"]);
        if (!process.env.TMUX && !this.attachNoticeShown && ctx.hasUI) {
          this.attachNoticeShown = true;
          ctx.ui.notify(`Agents are visible in tmux. Attach with: tmux attach -t ${this.sessionName}`, "info");
        }
        resolvePane(pane.trim());
      } catch (error) {
        rejectPane(error as Error);
      }
    });
    this.paneQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async ensureController(ctx: ExtensionContext) {
    if (this.controller) return;
    const hostPane = process.env.TMUX_PANE;
    if (process.env.TMUX && hostPane) {
      const result = await this.pi.exec("tmux", ["display-message", "-p", "-t", hostPane, "#{session_id}"], {
        timeout: 5_000,
      });
      if (result.code !== 0 || !result.stdout.trim())
        throw new Error(result.stderr || "Could not resolve tmux session");
      this.session = result.stdout.trim();
      this.sessionName = "";
    } else {
      this.sessionName = `pibarm-${slug(basename(ctx.cwd), "project")}-${slug(ctx.sessionManager.getSessionId()).slice(0, 8)}-${process.pid}`;
      const created = await this.pi.exec(
        "tmux",
        [
          "new-session",
          "-d",
          "-P",
          "-F",
          "#{session_id} #{window_id}",
          "-s",
          this.sessionName,
          "-n",
          "pibarm-control",
          "sleep",
          "2147483647",
        ],
        { cwd: ctx.cwd, timeout: 10_000 },
      );
      if (created.code !== 0) throw new Error(created.stderr || created.stdout || "Could not create tmux session");
      [this.session, this.placeholderWindow] = created.stdout.trim().split(/\s+/, 2);
    }
    const controller = new TmuxControl(
      this.session,
      () => undefined,
      () => {
        if (this.controller === controller) this.controller = undefined;
      },
    );
    try {
      await controller.ready;
      this.controller = controller;
    } catch (error) {
      controller.close();
      throw error;
    }
  }

  private async gitRoot(cwd: string) {
    const result = await this.pi.exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { timeout: 10_000 });
    return result.code === 0 && result.stdout.trim() ? result.stdout.trim() : cwd;
  }

  private uniqueId(requested: string) {
    const base = slug(requested);
    if (!this.records.has(base)) return base;
    for (let index = 2; index < 1_000; index++) if (!this.records.has(`${base}-${index}`)) return `${base}-${index}`;
    return `${base}-${Date.now()}`;
  }

  private async keepDetachedSession(pane: string) {
    if (
      !this.sessionName ||
      this.placeholderWindow ||
      !this.controller ||
      [...this.records.values()].some((record) => record.state === "running" && record.pane !== pane)
    )
      return;
    this.placeholderWindow = await this.controller.command([
      "new-window",
      "-d",
      "-P",
      "-F",
      "#{window_id}",
      "-t",
      this.session,
      "-n",
      "pibarm-control",
      "sleep",
      "2147483647",
    ]);
  }

  private async killPane(pane: string) {
    await this.controller?.command(["kill-pane", "-t", pane]).catch(() => undefined);
  }

  private async listOrCapture(requested: string, ctx: ExtensionContext) {
    if (requested) {
      const record = this.findRecord(requested);
      if (!record) return ctx.ui.notify(`Unknown agent: ${requested}`, "warning");
      return ctx.ui.notify((await readLog(record.logPath, 200)) || "(no agent output)", "info");
    }
    const lines = [...this.records.values()].map(
      (record) => `${record.id}: ${record.state}${record.code === undefined ? "" : ` (exit ${record.code})`}`,
    );
    ctx.ui.notify(lines.length ? lines.join("\n") : "No managed agents.", "info");
  }

  private async attach(ctx: ExtensionContext) {
    if (!this.window && !this.sessionName) return ctx.ui.notify("No managed tmux agent window.", "warning");
    if (process.env.TMUX && this.window) {
      const result = await this.pi.exec("tmux", ["select-window", "-t", this.window], { timeout: 5_000 });
      return ctx.ui.notify(
        result.code === 0 ? "Focused managed agent window." : result.stderr || "Could not focus agent window.",
        result.code === 0 ? "info" : "error",
      );
    }
    ctx.ui.notify(`Attach with: tmux attach -t ${this.sessionName}`, "info");
  }

  private async kill(requested: string, ctx: ExtensionContext) {
    const matches = requested === "all" ? [...this.records.values()] : [this.findRecord(requested)].filter(Boolean);
    const targets = (matches as AgentRecord[]).filter((record) => record.state === "running");
    if (!targets.length) return ctx.ui.notify(`No running managed agent matched: ${requested}`, "warning");
    for (const record of targets) await this.killPane(record.pane);
    ctx.ui.notify(`Killed ${targets.length} managed agent(s).`, "info");
  }

  private findRecord(requested: string) {
    const id = slug(requested);
    if (this.records.has(id)) return this.records.get(id);
    const matches = [...this.records.values()].filter((record) => record.id.startsWith(`${id}-`));
    return matches.length === 1 ? matches[0] : undefined;
  }

  private async killRunning() {
    for (const record of this.records.values()) if (record.state === "running") await this.killPane(record.pane);
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
