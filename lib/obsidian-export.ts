import { mkdir, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import type { ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { getObsidianSettings } from "./pibarm-settings.js";

function slug(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "session";
}

function yamlString(value: string) {
  return JSON.stringify(value);
}

function textContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return JSON.stringify(content ?? "");
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part === "object" && "type" in part) {
      const typed = part as { type?: unknown; text?: unknown; source?: unknown };
      if (typed.type === "text" && typeof typed.text === "string") return typed.text;
      if (typed.type === "image") return "[image]";
    }
    return JSON.stringify(part);
  }).filter(Boolean).join("\n");
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
  if (!settings.configured) throw new Error("Obsidian vault is not configured. Set pibarm.obsidian.vault in ~/.pi/agent/settings.json or .pi/settings.json.");

  const sessionId = ctx.sessionManager.getSessionId();
  const sessionName = ctx.sessionManager.getSessionName();
  const project = slug(basename(ctx.cwd));
  const title = sessionName || `Pi session ${sessionId}`;
  const dir = resolve(settings.vault, settings.basePath, project);
  const insideVault = relative(resolve(settings.vault), dir);
  if (insideVault.startsWith("..") || isAbsolute(insideVault)) {
    throw new Error(`Refusing to export outside the vault: ${dir}`);
  }
  const shortId = sessionId.replace(/[^a-z0-9]/gi, "").slice(0, 8);
  const fileName = sessionName ? `${slug(sessionName)}-${shortId}` : slug(sessionId);
  const path = join(dir, `${fileName}.md`);
  const entries = ctx.sessionManager.getBranch();
  const sessionFile = ctx.sessionManager.getSessionFile();

  await mkdir(dir, { recursive: true });
  const body = [
    "---",
    `title: ${yamlString(title)}`,
    `session_id: ${yamlString(sessionId)}`,
    `project: ${yamlString(project)}`,
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
  ].filter((line): line is string => line !== undefined).join("\n");

  await writeFile(path, `${body.trimEnd()}\n`, "utf8");
  return { path, settings, entries: entries.length };
}
