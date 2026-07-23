import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { managedSessionName, type AgentPaneAdapter, type AgentPaneCreateOptions } from "./agent-pane-adapter.js";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function controlCommand(args: readonly string[]): string {
  return args.map(shellQuote).join(" ");
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
    private readonly onExit: () => void,
  ) {
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.child = spawn("tmux", ["-C", "attach-session", "-t", session], { stdio: ["pipe", "pipe", "pipe"] });
    this.child.stdout.on("data", (chunk) => this.consume(String(chunk)));
    this.child.stderr.resume();
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
      this.queue.push({ command: controlCommand(args), resolve, reject });
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
    if (line.startsWith("%session-changed")) return this.readyResolve();
    if (line.startsWith("%begin")) {
      this.response = [];
      return;
    }
    if (line.startsWith("%end") || line.startsWith("%error")) {
      const current = this.current;
      this.current = undefined;
      if (current) {
        const output = this.response.join("\n").trim();
        if (line.startsWith("%error")) current.reject(new Error(output || "tmux command failed"));
        else current.resolve(output);
      }
      this.response = [];
      this.pump();
      return;
    }
    if (/^%(?:output|pane-|window-|session-|layout-change|client-|exit)/.test(line)) return;
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

export class TmuxAgentPaneAdapter implements AgentPaneAdapter {
  readonly kind = "tmux";
  private checked?: boolean;
  private controller?: TmuxControl;
  private session = "";
  private sessionName = "";
  private window = "";
  private placeholderWindow = "";
  private readonly panes = new Set<string>();

  constructor(private readonly pi: ExtensionAPI) {}

  async available() {
    if (this.checked === undefined) {
      const result = await this.pi.exec("tmux", ["-V"], { timeout: 5_000 });
      this.checked = result.code === 0;
    }
    return this.checked;
  }

  async create(options: AgentPaneCreateOptions) {
    await this.ensureSession(options);
    const control = this.controller!;
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
      await control.command(["respawn-pane", "-k", "-c", options.cwd, "-t", pane, ...options.command]);
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
        ...options.command,
      ]);
    }
    await control.command(["select-layout", "-t", this.window, "tiled"]).catch(() => undefined);
    if (this.placeholderWindow) {
      await control.command(["kill-window", "-t", this.placeholderWindow]).catch(() => undefined);
      this.placeholderWindow = "";
    }
    pane = pane.trim();
    this.panes.add(pane);
    return pane;
  }

  async close(pane: string) {
    if (!this.panes.delete(pane)) return;
    if (this.sessionName && this.panes.size === 0 && !this.placeholderWindow && this.controller) {
      this.placeholderWindow = await this.controller
        .command([
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
        ])
        .catch(() => "");
    }
    await this.controller?.command(["kill-pane", "-t", pane]).catch(() => undefined);
    if (this.panes.size === 0) this.window = "";
  }

  async focus(_pane: string) {
    if (this.sessionName || !this.window) return false;
    const result = await this.pi.exec("tmux", ["select-window", "-t", this.window], { timeout: 5_000 });
    return result.code === 0;
  }

  attachCommand() {
    return this.sessionName ? `tmux attach -t ${this.sessionName}` : undefined;
  }

  async shutdown() {
    this.controller?.close();
    if (this.sessionName)
      await this.pi.exec("tmux", ["kill-session", "-t", this.sessionName], { timeout: 5_000 }).catch(() => undefined);
  }

  private async ensureSession(options: AgentPaneCreateOptions) {
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
      this.sessionName = managedSessionName(options);
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
        { cwd: options.sessionCwd, timeout: 10_000 },
      );
      if (created.code !== 0) throw new Error(created.stderr || created.stdout || "Could not create tmux session");
      [this.session, this.placeholderWindow] = created.stdout.trim().split(/\s+/, 2);
    }
    const controller = new TmuxControl(this.session, () => {
      if (this.controller === controller) this.controller = undefined;
    });
    try {
      await controller.ready;
      this.controller = controller;
    } catch (error) {
      controller.close();
      throw error;
    }
  }
}
