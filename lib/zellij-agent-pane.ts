import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  managedSessionName,
  paneSlug,
  type AgentPaneAdapter,
  type AgentPaneCreateOptions,
} from "./agent-pane-adapter.js";

export class ZellijAgentPaneAdapter implements AgentPaneAdapter {
  readonly kind = "zellij";
  private checked?: boolean;
  private noFocus = false;
  private sessionName = "";
  private managed = false;

  constructor(private readonly pi: ExtensionAPI) {}

  async available() {
    if (this.checked !== undefined) return this.checked;
    const version = await this.pi.exec("zellij", ["--version"], { timeout: 5_000 });
    if (version.code !== 0) return (this.checked = false);
    const [create, close, focus] = await Promise.all([
      this.pi.exec("zellij", ["action", "new-pane", "--help"], { timeout: 5_000 }),
      this.pi.exec("zellij", ["action", "close-pane", "--help"], { timeout: 5_000 }),
      this.pi.exec("zellij", ["action", "focus-pane-id", "--help"], { timeout: 5_000 }),
    ]);
    this.noFocus = create.stdout.includes("--no-focus");
    this.checked =
      create.code === 0 &&
      create.stdout.includes("--close-on-exit") &&
      close.code === 0 &&
      close.stdout.includes("--pane-id") &&
      focus.code === 0 &&
      (this.noFocus || !process.env.ZELLIJ_SESSION_NAME || Boolean(process.env.ZELLIJ_PANE_ID));
    return this.checked;
  }

  async create(options: AgentPaneCreateOptions) {
    await this.ensureSession(options);
    const args = [
      "--session",
      this.sessionName,
      "action",
      "new-pane",
      "--cwd",
      options.cwd,
      "--name",
      `pibarm-${paneSlug(options.id)}`,
      "--close-on-exit",
    ];
    if (this.noFocus) args.push("--no-focus");
    args.push("--", ...options.command);
    const result = await this.pi.exec("zellij", args, { timeout: 10_000 });
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Could not create Zellij pane");
    const pane = result.stdout.match(/(?:terminal_|plugin_)?\d+\s*$/)?.[0].trim();
    if (!pane) throw new Error(`Unexpected Zellij pane response: ${result.stdout.trim() || "(empty)"}`);
    if (!this.noFocus && !this.managed && process.env.ZELLIJ_PANE_ID)
      await this.pi.exec(
        "zellij",
        ["--session", this.sessionName, "action", "focus-pane-id", process.env.ZELLIJ_PANE_ID],
        { timeout: 5_000 },
      );
    return pane;
  }

  async close(pane: string) {
    if (!this.sessionName) return;
    await this.pi
      .exec("zellij", ["--session", this.sessionName, "action", "close-pane", "--pane-id", pane], {
        timeout: 5_000,
      })
      .catch(() => undefined);
  }

  async focus(pane: string) {
    if (this.managed || !this.sessionName) return false;
    const result = await this.pi.exec("zellij", ["--session", this.sessionName, "action", "focus-pane-id", pane], {
      timeout: 5_000,
    });
    return result.code === 0;
  }

  attachCommand() {
    return this.managed ? `zellij attach ${this.sessionName}` : undefined;
  }

  async shutdown() {
    if (this.managed && this.sessionName)
      await this.pi.exec("zellij", ["kill-session", this.sessionName], { timeout: 5_000 }).catch(() => undefined);
  }

  private async ensureSession(options: AgentPaneCreateOptions) {
    if (this.sessionName) return;
    if (process.env.ZELLIJ_SESSION_NAME) {
      this.sessionName = process.env.ZELLIJ_SESSION_NAME;
      return;
    }
    this.sessionName = managedSessionName(options);
    const created = await this.pi.exec("zellij", ["attach", "--create-background", this.sessionName], {
      cwd: options.sessionCwd,
      timeout: 10_000,
    });
    if (created.code !== 0) {
      this.sessionName = "";
      throw new Error(created.stderr || created.stdout || "Could not create Zellij session");
    }
    this.managed = true;
  }
}
