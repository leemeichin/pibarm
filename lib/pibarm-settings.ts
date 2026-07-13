import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";

export interface ObsidianSettings {
  vault?: string;
  basePath?: string;
  autoSync?: boolean;
  debounceMs?: number;
  includeAttachments?: boolean;
}

export interface MatrixSettings {
  autoSpawn?: boolean;
}

export interface PibarmSettings {
  obsidian?: ObsidianSettings;
  matrix?: MatrixSettings;
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
