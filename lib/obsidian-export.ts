import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { CONFIG_DIR_NAME, type ExtensionContext, type SessionEntry } from "@earendil-works/pi-coding-agent";
import { getObsidianSettings } from "./pibarm-settings.js";

const execFileAsync = promisify(execFile);

const INDEX_FILE = ".pibarm-sessions.json";

interface SessionIndexEntry {
  path: string;
  named: boolean;
}

interface SessionIndex {
  version: 1;
  sessions: Record<string, SessionIndexEntry>;
}

function slug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function pathSegment(input: string): string | undefined {
  const value = slug(input);
  return value && value !== "." && value !== ".." ? value : undefined;
}

function insideVault(vault: string, path: string) {
  const rel = relative(resolve(vault), resolve(path));
  return !rel.startsWith("..") && !isAbsolute(rel);
}

export function parseForgeRemote(url: string): { org: string; repo: string } | undefined {
  const trimmed = url
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");
  if (!trimmed) return undefined;
  const scp = trimmed.match(/^[^@\s]+@[^:/\s]+:(.+)$/);
  let path = scp?.[1];
  if (!path) {
    try {
      path = new URL(trimmed).pathname;
    } catch {
      return undefined;
    }
  }
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) return undefined;
  const org = pathSegment(segments[segments.length - 2]);
  const repo = pathSegment(segments[segments.length - 1]);
  return org && repo ? { org, repo } : undefined;
}

async function gitRemoteUrl(cwd: string): Promise<string | undefined> {
  const getUrl = async (remote: string) => {
    const { stdout } = await execFileAsync("git", ["-C", cwd, "remote", "get-url", remote], { timeout: 5000 });
    return stdout.trim() || undefined;
  };
  try {
    return await getUrl("origin");
  } catch {
    try {
      const { stdout } = await execFileAsync("git", ["-C", cwd, "remote"], { timeout: 5000 });
      const first = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)[0];
      return first ? await getUrl(first) : undefined;
    } catch {
      return undefined;
    }
  }
}

async function resolveRepoDir(cwd: string): Promise<string> {
  const url = await gitRemoteUrl(cwd);
  const parsed = url ? parseForgeRemote(url) : undefined;
  if (parsed) return `${parsed.org}/${parsed.repo}`;
  return `local/${pathSegment(basename(cwd)) ?? "project"}`;
}

// Index paths use forward slashes so the vault index stays portable across machines.
export function claimNotePath(index: SessionIndex, sessionId: string, dir: string, base: string): string {
  const taken = new Set(
    Object.entries(index.sessions)
      .filter(([id]) => id !== sessionId)
      .map(([, entry]) => entry.path),
  );
  const candidate = `${dir}/${base}.md`;
  if (!taken.has(candidate)) return candidate;
  let suffixed = `${dir}/${base}-${sessionId.slice(0, 8)}.md`;
  let attempt = 2;
  while (taken.has(suffixed)) suffixed = `${dir}/${base}-${sessionId.slice(0, 8)}-${attempt++}.md`;
  return suffixed;
}

async function readIndex(root: string): Promise<SessionIndex> {
  try {
    const parsed = JSON.parse(await readFile(join(root, INDEX_FILE), "utf8"));
    if (parsed && typeof parsed === "object" && typeof parsed.sessions === "object" && parsed.sessions !== null) {
      return { version: 1, sessions: parsed.sessions as Record<string, SessionIndexEntry> };
    }
  } catch {
    // Missing or corrupt index: start fresh; existing notes are never deleted, only re-claimed.
  }
  return { version: 1, sessions: {} };
}

async function writeIndex(root: string, index: SessionIndex) {
  await mkdir(root, { recursive: true });
  await writeFile(join(root, INDEX_FILE), `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

async function resolveNotePath(
  vault: string,
  root: string,
  repoDir: string,
  sessionId: string,
  sessionName: string | undefined,
) {
  const index = await readIndex(root);
  const recorded = index.sessions[sessionId];
  // The index lives inside the vault and syncs across machines; distrust entries
  // whose path would land outside the vault.
  const existing =
    recorded && typeof recorded.path === "string" && insideVault(vault, join(root, recorded.path))
      ? recorded
      : undefined;

  if (existing?.named || (existing && !sessionName)) return existing.path;

  if (existing && sessionName) {
    // One-time upgrade: the session was first exported before it had a name.
    const newPath = claimNotePath(index, sessionId, dirname(existing.path), slug(sessionName) || "session");
    if (newPath !== existing.path && insideVault(vault, join(root, newPath))) {
      await rename(join(root, existing.path), join(root, newPath)).catch(() => {});
    }
    index.sessions[sessionId] = { path: newPath, named: true };
    await writeIndex(root, index);
    return newPath;
  }

  const base = slug(sessionName ?? "") || slug(sessionId) || "session";
  const path = claimNotePath(index, sessionId, repoDir, base);
  index.sessions[sessionId] = { path, named: Boolean(sessionName) };
  await writeIndex(root, index);
  return path;
}

function yamlString(value: string) {
  return JSON.stringify(value);
}

function textContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return JSON.stringify(content ?? "");
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "type" in part) {
        const typed = part as { type?: unknown; text?: unknown; source?: unknown };
        if (typed.type === "text" && typeof typed.text === "string") return typed.text;
        if (typed.type === "image") return "[image]";
      }
      return JSON.stringify(part);
    })
    .filter(Boolean)
    .join("\n");
}

function renderEntry(entry: SessionEntry): string {
  if (entry.type === "message") {
    const message = entry.message as { role?: string; content?: unknown; toolName?: string };
    const role = message.role ?? "message";
    return `## ${role}\n\n${textContent(message.content).trim() || "_(empty)_"}\n`;
  }
  if (entry.type === "custom_message") {
    return `## ${entry.customType}\n\n${textContent(entry.content).trim() || "_(empty)_"}\n`;
  }
  if (entry.type === "compaction") {
    return `## Compaction\n\n${entry.summary.trim()}\n`;
  }
  if (entry.type === "branch_summary") {
    return `## Branch summary\n\n${entry.summary.trim()}\n`;
  }
  if (entry.type === "model_change") return `> model: ${entry.provider}/${entry.modelId}\n`;
  if (entry.type === "thinking_level_change") return `> thinking: ${entry.thinkingLevel}\n`;
  if (entry.type === "session_info" && entry.name) return `> session name: ${entry.name}\n`;
  return "";
}

export async function exportCurrentSessionToObsidian(ctx: ExtensionContext) {
  const settings = await getObsidianSettings(ctx);
  if (!settings.configured)
    throw new Error(
      `Obsidian vault is not configured. Set pibarm.obsidian.vault in ~/${CONFIG_DIR_NAME}/agent/settings.json or ${CONFIG_DIR_NAME}/settings.json.`,
    );

  const sessionId = ctx.sessionManager.getSessionId();
  const sessionName = ctx.sessionManager.getSessionName();
  const root = join(settings.vault, settings.basePath);
  const repoDir = await resolveRepoDir(ctx.cwd);
  const notePath = await resolveNotePath(settings.vault, root, repoDir, sessionId, sessionName || undefined);
  const title = sessionName || `Pi session ${sessionId}`;
  const path = resolve(root, notePath);
  if (!insideVault(settings.vault, path)) {
    throw new Error(`Refusing to export outside the vault: ${path}`);
  }
  const entries = ctx.sessionManager.getBranch();
  const sessionFile = ctx.sessionManager.getSessionFile();

  await mkdir(dirname(path), { recursive: true });
  const body = [
    "---",
    `title: ${yamlString(title)}`,
    `session_id: ${yamlString(sessionId)}`,
    `repo: ${yamlString(dirname(notePath))}`,
    `cwd: ${yamlString(ctx.cwd)}`,
    sessionFile ? `session_file: ${yamlString(sessionFile)}` : undefined,
    `exported_at: ${yamlString(new Date().toISOString())}`,
    "tags:",
    "  - pi",
    "  - pibarm",
    "---",
    "",
    `# ${title}`,
    "",
    `- Project: \`${ctx.cwd}\``,
    sessionFile ? `- Session file: \`${sessionFile}\`` : undefined,
    `- Entries: ${entries.length}`,
    "",
    ...entries.map(renderEntry).filter(Boolean),
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");

  await writeFile(path, `${body.trimEnd()}\n`, "utf8");
  return { path, settings, entries: entries.length };
}
