import { basename } from "node:path";

export type MultiplexerKind = "tmux" | "zellij";

export function paneSlug(value: string, fallback = "agent") {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || fallback
  );
}

export interface AgentPaneCreateOptions {
  id: string;
  cwd: string;
  command: string[];
  sessionCwd: string;
  sessionId: string;
}

export function managedSessionName(options: Pick<AgentPaneCreateOptions, "sessionCwd" | "sessionId">) {
  return `pibarm-${paneSlug(basename(options.sessionCwd), "project")}-${paneSlug(options.sessionId).slice(0, 8)}-${process.pid}`;
}

export interface AgentPaneAdapter {
  readonly kind: MultiplexerKind;
  available(): Promise<boolean>;
  create(options: AgentPaneCreateOptions): Promise<string>;
  close(pane: string): Promise<void>;
  focus(pane: string): Promise<boolean>;
  attachCommand(): string | undefined;
  shutdown(): Promise<void>;
}
