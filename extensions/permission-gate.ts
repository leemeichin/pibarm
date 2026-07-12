import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DANGEROUS_BASH = [
  /\bsudo\b/,
  /\brm\s+(-[^\s]*r|--recursive)/,
  /\b(chmod|chown)\b/,
  /\b(dd|mkfs|diskutil)\b/,
  /\b(git\s+clean|git\s+reset\s+--hard|git\s+push\b)/,
  /\b(curl|wget)\b.*\|\s*(sh|bash|zsh)/,
];

const MUTATING_BASH = /\b(rm|mv|cp|mkdir|touch|tee|chmod|chown|npm\s+install|pnpm\s+install|yarn\s+install|bun\s+install|git\s+(apply|am|merge|rebase|checkout|switch|stash|commit|push|clean|reset))\b|\bsed\s+-i\b|>\s*[^&]/;
const SENSITIVE_PATH = /(^|\/)(\.env|\.git|node_modules|\.ssh|\.aws|\.gnupg)(\/|$)|\.(pem|key)$/i;
const PATH_TOKEN = /(^|[\s=:])([~./][^\s"'`;$|&<>]*)/g;

export function isInside(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(root, path));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

export function expandsOutsideProject(command: string, cwd: string): boolean {
  for (const match of command.matchAll(PATH_TOKEN)) {
    const token = match[2];
    if (!token || token === "." || token.startsWith("./")) continue;
    if (token.startsWith("/tmp") || token.startsWith("/var/folders")) continue;
    if (token.startsWith("~") || token.startsWith("/")) {
      if (!isInside(cwd, token.replace(/^~/, process.env.HOME ?? "~"))) return true;
      continue;
    }
    if (token.startsWith("..")) return true;
  }
  return false;
}

function riskyBash(command: string, cwd: string): string | undefined {
  if (DANGEROUS_BASH.some((pattern) => pattern.test(command))) return "dangerous shell command";
  if (SENSITIVE_PATH.test(command)) return "sensitive path";
  if (expandsOutsideProject(command, cwd)) return MUTATING_BASH.test(command) ? "mutates outside project" : "references outside project";
  return undefined;
}

async function confirm(ctx: any, title: string, body: string) {
  if (!ctx.hasUI) return false;
  return await ctx.ui.confirm(title, body);
}

export default function permissionGate(pi: ExtensionAPI) {
  // Disabled by default: the current heuristic is too noisy. Re-enable with
  // PI_PERMISSION_GATE=1 until the gate can remember approvals and support yolo mode.
  if (process.env.PI_PERMISSION_GATE !== "1") return;

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash") {
      const command = String((event.input as { command?: unknown }).command ?? "");
      const reason = riskyBash(command, ctx.cwd);
      if (!reason) return;
      if (await confirm(ctx, `Allow ${reason}?`, command)) return;
      return { block: true, reason: `Blocked ${reason}` };
    }

    if (event.toolName !== "edit" && event.toolName !== "write") return;

    const path = String((event.input as { path?: unknown }).path ?? "");
    const absolute = resolve(ctx.cwd, path.replace(/^@/, ""));
    const reason = !isInside(ctx.cwd, absolute)
      ? "write outside project"
      : SENSITIVE_PATH.test(path)
        ? "write to sensitive path"
        : undefined;
    if (!reason) return;
    if (await confirm(ctx, `Allow ${reason}?`, path)) return;
    return { block: true, reason: `Blocked ${reason}` };
  });
}
