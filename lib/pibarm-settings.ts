import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export interface ObsidianSettings {
  vault?: string;
  basePath?: string;
  autoSync?: boolean;
  debounceMs?: number;
  includeAttachments?: boolean;
}

export interface PibarmSettings {
  obsidian?: ObsidianSettings;
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

export async function getPibarmSettings(cwd: string): Promise<PibarmSettings> {
  const global = await readJson(join(homedir(), ".pi", "agent", "settings.json"));
  const project = await readJson(join(cwd, ".pi", "settings.json"));
  const merged = deepMerge(global, project);
  return isRecord(merged.pibarm) ? merged.pibarm as PibarmSettings : {};
}

export async function getObsidianSettings(cwd: string): Promise<Required<ObsidianSettings> & { configured: boolean }> {
  const settings = (await getPibarmSettings(cwd)).obsidian ?? {};
  const vault = typeof settings.vault === "string" && settings.vault.trim() ? expandPath(settings.vault.trim(), cwd) : "";
  const basePath = typeof settings.basePath === "string" && settings.basePath.trim() ? settings.basePath.trim().replace(/^\/+|\/+$/g, "") : "Pi";
  return {
    vault,
    basePath,
    autoSync: settings.autoSync === true,
    debounceMs: typeof settings.debounceMs === "number" ? Math.max(250, settings.debounceMs) : 2000,
    includeAttachments: settings.includeAttachments !== false,
    configured: Boolean(vault),
  };
}
