import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";

export interface ObsidianSettings {
  vault?: string;
  basePath?: string;
  autoSync?: boolean;
  debounceMs?: number;
  includeAttachments?: boolean;
}

export interface AgentPanesSettings {
  enabled?: boolean;
  include?: Array<"subagent" | "worktree">;
  multiplexer?: "auto" | "tmux" | "zellij";
  outsideMultiplexer?: "detached" | "headless";
}

export interface CodeIntelSettings {
  enabled?: boolean;
  autoInstall?: boolean;
  timeoutMs?: number;
}

export interface GitSettings {
  commitTrailer?: boolean;
}

export interface PibarmSettings {
  obsidian?: ObsidianSettings;
  agentPanes?: AgentPanesSettings;
  codeIntel?: CodeIntelSettings;
  git?: GitSettings;
}

export interface SettingsContext {
  cwd: string;
  isProjectTrusted(): boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T extends Record<string, unknown>>(base: T, override: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = out[key];
    out[key] = isRecord(current) && isRecord(value) ? deepMerge(current, value) : value;
  }
  return out as T;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export interface PibarmSettingUpdate {
  path: readonly string[];
  value: string | number | boolean | string[];
}

export async function readSettingsDocument(path: string): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isRecord(parsed)) throw new Error(`Settings file must contain a JSON object: ${path}`);
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    if (error instanceof SyntaxError) throw new Error(`Invalid JSON in settings file: ${path}`, { cause: error });
    throw error;
  }
}

export async function updatePibarmSettings(path: string, updates: readonly PibarmSettingUpdate[]): Promise<void> {
  if (!updates.length) return;
  const document = await readSettingsDocument(path);
  const existing = document.pibarm;
  if (existing !== undefined && !isRecord(existing)) throw new Error(`pibarm settings must be a JSON object: ${path}`);
  const pibarm: Record<string, unknown> = { ...existing };
  document.pibarm = pibarm;

  for (const update of updates) {
    if (!update.path.length) throw new Error("A pibarm setting path cannot be empty");
    let target = pibarm;
    for (const key of update.path.slice(0, -1)) {
      const child = target[key];
      if (child !== undefined && !isRecord(child)) {
        throw new Error(`pibarm.${update.path.join(".")} conflicts with a non-object setting`);
      }
      const next = { ...child };
      target[key] = next;
      target = next;
    }
    target[update.path.at(-1)!] = update.value;
  }

  await mkdir(dirname(path), { recursive: true });
  let mode = 0o600;
  try {
    mode = (await stat(path)).mode & 0o777;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
  }
}

function expandPath(path: string, cwd: string) {
  const expanded = path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
  return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}

export function sanitizeBasePath(input: string): string {
  // Keep the export destination inside the vault: drop empty, ".", "..", and
  // absolute segments so a project-supplied basePath cannot traverse out.
  const segments = input.split(/[\\/]+/).filter((segment) => segment && segment !== "." && segment !== "..");
  return segments.join("/");
}

export function mergePibarmSettings(
  global: Record<string, unknown>,
  project: Record<string, unknown>,
  projectTrusted: boolean,
): PibarmSettings {
  // Project settings can redirect exports (and future behavior) to attacker
  // chosen paths, so only honor them once the project is trusted.
  const merged = projectTrusted ? deepMerge(global, project) : global;
  return isRecord(merged.pibarm) ? (merged.pibarm as PibarmSettings) : {};
}

export async function getPibarmSettings(ctx: SettingsContext): Promise<PibarmSettings> {
  const global = await readJson(join(getAgentDir(), "settings.json"));
  const project = await readJson(join(ctx.cwd, CONFIG_DIR_NAME, "settings.json"));
  return mergePibarmSettings(global, project, ctx.isProjectTrusted());
}

export function normalizeObsidianSettings(
  settings: ObsidianSettings,
  cwd: string,
): Required<ObsidianSettings> & { configured: boolean } {
  const vault =
    typeof settings.vault === "string" && settings.vault.trim() ? expandPath(settings.vault.trim(), cwd) : "";
  const basePath = (typeof settings.basePath === "string" ? sanitizeBasePath(settings.basePath.trim()) : "") || "Pi";
  return {
    vault,
    basePath,
    autoSync: settings.autoSync === true,
    debounceMs: typeof settings.debounceMs === "number" ? Math.max(250, settings.debounceMs) : 2000,
    includeAttachments: settings.includeAttachments !== false,
    configured: Boolean(vault),
  };
}

export async function getObsidianSettings(
  ctx: SettingsContext,
): Promise<Required<ObsidianSettings> & { configured: boolean }> {
  return normalizeObsidianSettings((await getPibarmSettings(ctx)).obsidian ?? {}, ctx.cwd);
}
