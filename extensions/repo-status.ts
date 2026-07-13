import { basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const PARAMS = Type.Object({});

type Forge = "github" | "sourcehut" | "git";
// Tones mirror the design system's StatusLine: orange project, plain model,
// muted context/dirty, pea/mustard/tomato status colours, plum for merged.
// "customMessageLabel" is the closest theme slot to the design system's plum
// (purple in the built-in pi themes too), so merged PRs read as merged.
type Tone = "dim" | "muted" | "success" | "warning" | "error" | "accent" | "text" | "customMessageLabel";
type StatusPart = { text: string; tone: Tone };

async function exec(pi: ExtensionAPI, command: string, args: string[], timeout = 10000) {
  const result = await pi.exec(command, args, { timeout });
  return { stdout: result.stdout?.trim() ?? "", stderr: result.stderr?.trim() ?? "", code: result.code };
}

function parseForge(remote: string): Forge {
  if (remote.includes("github.com")) return "github";
  if (remote.includes("git.sr.ht")) return "sourcehut";
  return "git";
}

function checkSummary(checks: any[]): StatusPart {
  if (!Array.isArray(checks) || checks.length === 0) return { text: " CI", tone: "muted" };
  const bad = checks.find((c) => ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].includes(c.conclusion));
  if (bad) return { text: " CI", tone: "error" };
  const pending = checks.find((c) => c.status && c.status !== "COMPLETED");
  if (pending) return { text: " CI", tone: "warning" };
  return { text: " CI", tone: "success" };
}

function prPart(pr: any): StatusPart {
  const text = ` #${pr.number}${pr.isDraft ? " draft" : ""}`;
  if (pr.isDraft) return { text, tone: "muted" };
  if (pr.state === "MERGED") return { text, tone: "customMessageLabel" };
  if (pr.state === "CLOSED") return { text, tone: "error" };
  return { text, tone: "success" };
}

function runSummary(run: any): StatusPart {
  if (run.status !== "completed") return { text: " CI", tone: "warning" };
  return run.conclusion === "success" ? { text: " CI", tone: "success" } : { text: " CI", tone: "error" };
}

function plain(parts: StatusPart[]): string {
  return parts.map((part) => part.text).join(" | ");
}

// Common technical acronyms that match the JIRA key shape (UTF-8, SHA-256, …)
// but are never project keys.
const NOT_JIRA_KEYS = new Set(["UTF", "SHA", "ISO", "RFC", "CVE", "AES", "RSA", "MD", "GPG", "TLS", "HTTP", "ES", "EC", "X", "OAUTH", "IPV"]);

export function firstJiraTicket(text: string): string | undefined {
  for (const match of text.matchAll(/\b([A-Z][A-Z0-9]+)-\d+\b/g)) {
    const key = match[1]!.replace(/\d+$/, "");
    if (!NOT_JIRA_KEYS.has(key)) return match[0];
  }
  return undefined;
}

async function jiraTicketForBranch(pi: ExtensionAPI, branch: string) {
  const fromBranch = firstJiraTicket(branch);
  if (fromBranch) return fromBranch;

  const baseCandidates = ["origin/main", "origin/master", "origin/trunk", "origin/develop", "main", "master", "trunk", "develop"];
  for (const base of baseCandidates) {
    const mergeBase = await exec(pi, "git", ["merge-base", "HEAD", base], 5000);
    if (mergeBase.code !== 0 || !mergeBase.stdout) continue;
    const log = await exec(pi, "git", ["log", "--format=%s%n%b", `${mergeBase.stdout}..HEAD`], 10000);
    const ticket = firstJiraTicket(log.stdout);
    if (ticket) return ticket;
  }

  const recent = await exec(pi, "git", ["log", "--format=%s%n%b", "--max-count", "50", "HEAD"], 10000);
  return firstJiraTicket(recent.stdout);
}

function parseShortstat(stat: string): { files?: number; insertions: number; deletions: number } {
  return {
    files: Number(stat.match(/(\d+) files? changed/)?.[1] ?? 0) || undefined,
    insertions: Number(stat.match(/(\d+) insertions?\(\+\)/)?.[1] ?? 0),
    deletions: Number(stat.match(/(\d+) deletions?\(-\)/)?.[1] ?? 0),
  };
}

async function uncommittedDiffPart(pi: ExtensionAPI, dirty: number): Promise<StatusPart | undefined> {
  if (!dirty) return undefined;
  const diff = await exec(pi, "git", ["diff", "--shortstat", "HEAD"], 10000);
  const parsed = parseShortstat(diff.stdout);
  if (parsed.insertions || parsed.deletions) {
    const plus = parsed.insertions ? `+${parsed.insertions}` : "+0";
    const minus = parsed.deletions ? `−${parsed.deletions}` : "−0";
    return { text: `▰▰▰▰ ${plus} ${minus}`, tone: "muted" };
  }
  return { text: `▰▰▰▰ ±${dirty}`, tone: "muted" };
}

function modelLabel(ctx: ExtensionContext): string {
  if (!ctx.model) return "󰚩 no model";
  const id = ctx.model.id
    .replace(/^claude-/, "")
    .replace(/^gpt-/, "gpt ")
    .replace(/(\d)-(\d)/g, "$1.$2")
    .replace(/-/g, " ")
    .replace(/\b(sonnet|haiku|opus)\b/i, (m) => m[0]!.toUpperCase() + m.slice(1));
  return `󰚩 ${ctx.model.provider}/${id}`;
}

function shortModelLabel(ctx: ExtensionContext): string {
  if (!ctx.model) return "󰚩 ?";
  return `󰚩 ${ctx.model.id.replace(/^claude-/, "")}`;
}

function contextLabel(ctx: ExtensionContext): string {
  const usage = ctx.getContextUsage();
  if (!usage || usage.percent === null) return "󰯌 ctx ?";
  return `󰯌 ctx ${Math.round(usage.percent)}%`;
}

function thinkingLabel(pi: ExtensionAPI): string | undefined {
  const level = pi.getThinkingLevel();
  return level && level !== "off" ? `󰌵 think ${level}` : undefined;
}

function extensionStatusesText(statuses: unknown): string {
  const values = statuses instanceof Map
    ? Array.from(statuses.entries())
      .filter(([key, value]) => !/ponytail/i.test(`${key} ${value}`))
      .map(([, value]) => value)
    : Array.isArray(statuses)
      ? statuses
      : statuses == null
        ? []
        : typeof statuses === "string"
          ? [statuses]
          : typeof (statuses as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function"
            ? Array.from(statuses as Iterable<unknown>)
            : [statuses];
  return values.map(String).filter((text) => text && !/ponytail/i.test(text)).join("  ");
}

// gh calls hit the network with 15s timeouts, and the jira sweep runs many
// git commands; cache both so the per-turn footer refresh stays cheap.
const GH_TTL_MS = 60000;
const ghCache = new Map<string, { at: number; parts: StatusPart[]; details: Record<string, unknown> }>();
const jiraCache = new Map<string, string | undefined>();

async function githubParts(pi: ExtensionAPI, branch: string): Promise<{ parts: StatusPart[]; details: Record<string, unknown> }> {
  const cached = ghCache.get(branch);
  if (cached && Date.now() - cached.at < GH_TTL_MS) return cached;
  const parts: StatusPart[] = [];
  const details: Record<string, unknown> = {};
  const pr = await exec(pi, "gh", ["pr", "view", "--json", "number,state,isDraft,statusCheckRollup,url"], 15000);
  if (pr.code === 0 && pr.stdout) {
    const parsed = JSON.parse(pr.stdout);
    parts.push(prPart(parsed));
    parts.push(checkSummary(parsed.statusCheckRollup));
    details.github = parsed;
  } else {
    const run = await exec(pi, "gh", ["run", "list", "--branch", branch, "--limit", "1", "--json", "status,conclusion,url"], 15000);
    if (run.code === 0 && run.stdout) {
      const parsed = JSON.parse(run.stdout)[0];
      if (parsed) {
        parts.push(runSummary(parsed));
        details.githubRun = parsed;
      }
    }
  }
  const entry = { at: Date.now(), parts, details };
  ghCache.set(branch, entry);
  return entry;
}

async function collect(pi: ExtensionAPI) {
  const [branchResult, shortResult, remoteResult] = await Promise.all([
    exec(pi, "git", ["branch", "--show-current"]),
    exec(pi, "git", ["status", "--short"]),
    exec(pi, "git", ["remote", "get-url", "origin"]),
  ]);
  const branch = branchResult.stdout || "detached";
  const dirty = shortResult.stdout ? shortResult.stdout.split("\n").filter(Boolean).length : 0;
  const forge = parseForge(remoteResult.stdout);
  if (!jiraCache.has(branch)) jiraCache.set(branch, await jiraTicketForBranch(pi, branch));
  const jiraTicket = jiraCache.get(branch);
  const rightParts: StatusPart[] = [];
  if (jiraTicket) rightParts.push({ text: jiraTicket, tone: "accent" });
  rightParts.push({ text: ` ${branch}`, tone: "text" });
  const diffPart = await uncommittedDiffPart(pi, dirty);
  if (diffPart) rightParts.push(diffPart);
  const details: Record<string, unknown> = { branch, dirty, forge, jiraTicket, uncommittedDiff: diffPart?.text };

  if (forge === "github") {
    const gh = await githubParts(pi, branch);
    rightParts.push(...gh.parts);
    Object.assign(details, gh.details);
  } else if (forge === "sourcehut") {
    rightParts.push({ text: " sr.ht", tone: "accent" });
  }

  const right = plain(rightParts);
  return { status: right, right, rightParts, details };
}

async function refresh(pi: ExtensionAPI, ctx: ExtensionContext, requestRender: () => void) {
  try {
    const status = await collect(pi);
    requestRender();
    return status;
  } catch (error) {
    requestRender();
    return { status: "", right: "", rightParts: [], details: { error: (error as Error).message } };
  }
}

function renderSegments(parts: StatusPart[], theme: ExtensionContext["ui"]["theme"]): string {
  return parts.map((part) => theme.fg(part.tone, part.text)).join(theme.fg("dim", " · "));
}

export default function repoStatusExtension(pi: ExtensionAPI) {
  let rightStatus = "";
  let rightStatusParts: StatusPart[] = [];
  let requestRender = () => {};

  function installFooter(ctx: ExtensionContext) {
    ctx.ui.setFooter((tui, theme, footerData) => {
      requestRender = () => tui.requestRender();
      return {
        invalidate() {},
        render(width: number): string[] {
          const statusText = extensionStatusesText(footerData.getExtensionStatuses());
          const dirPart: StatusPart = { text: ` ${basename(ctx.cwd)}`, tone: "accent" };
          const contextPart: StatusPart = { text: contextLabel(ctx), tone: "muted" };
          const thinking = thinkingLabel(pi);

          // Degrade left-side detail before ever cutting into the right-hand
          // repo/PR/CI segment, which is the most actionable part.
          const variants: StatusPart[][] = [];
          const full: StatusPart[] = [dirPart, { text: modelLabel(ctx), tone: "text" }, contextPart];
          if (thinking) full.push({ text: thinking, tone: "accent" });
          if (statusText) full.push({ text: ` ${statusText}`, tone: "dim" });
          variants.push(full);
          const noStatuses: StatusPart[] = [dirPart, { text: modelLabel(ctx), tone: "text" }, contextPart];
          if (thinking) noStatuses.push({ text: thinking, tone: "accent" });
          variants.push(noStatuses);
          variants.push([dirPart, { text: modelLabel(ctx), tone: "text" }, contextPart]);
          variants.push([dirPart, { text: shortModelLabel(ctx), tone: "text" }, contextPart]);
          variants.push([dirPart, contextPart]);

          const right = rightStatusParts.length > 0
            ? renderSegments(rightStatusParts, theme)
            : theme.fg("dim", rightStatus);
          const rightWidth = visibleWidth(right);
          if (rightWidth >= width) return [truncateToWidth(right, width)];

          for (const variant of variants) {
            const left = renderSegments(variant, theme);
            const leftWidth = visibleWidth(left);
            if (leftWidth + 1 + rightWidth <= width) {
              return [left + " ".repeat(width - leftWidth - rightWidth) + right];
            }
          }
          const left = truncateToWidth(renderSegments([dirPart, contextPart], theme), Math.max(0, width - rightWidth - 1));
          return [left + " ".repeat(Math.max(1, width - visibleWidth(left) - rightWidth)) + right];
        },
      };
    });
  }

  pi.registerTool({
    name: "repo_status",
    label: "Repo Status",
    description: "Summarize current git branch, dirty files, forge, PR, and CI status.",
    promptSnippet: "Inspect current repository, PR, and CI status",
    promptGuidelines: ["Use repo_status when the user asks for repository, PR, or CI status at a glance."],
    parameters: PARAMS,
    async execute(_id, _params, _signal, _update, ctx) {
      const status = await refresh(pi, ctx, requestRender);
      rightStatus = status.right;
      rightStatusParts = status.rightParts;
      return { content: [{ type: "text", text: status.status || JSON.stringify(status.details) }], details: status.details };
    },
  });

  pi.registerCommand("repo-status", {
    description: "Show git/forge/CI status and update the statusline",
    handler: async (_args, ctx) => {
      const status = await refresh(pi, ctx, requestRender);
      rightStatus = status.right;
      rightStatusParts = status.rightParts;
      ctx.ui.notify(status.status || JSON.stringify(status.details), "info");
    },
  });

  let refreshing = false;
  // Fire-and-forget: pi awaits lifecycle handlers, so a slow/unauthenticated
  // gh call must not stall the session between turns just to repaint a footer.
  function backgroundRefresh(ctx: ExtensionContext) {
    if (refreshing) return;
    refreshing = true;
    void refresh(pi, ctx, requestRender)
      .then((status) => {
        rightStatus = status.right;
        rightStatusParts = status.rightParts;
        requestRender();
      })
      .finally(() => {
        refreshing = false;
      });
  }

  pi.on("session_start", (_event, ctx) => {
    installFooter(ctx);
    backgroundRefresh(ctx);
  });
  pi.on("turn_end", (_event, ctx) => {
    backgroundRefresh(ctx);
  });
  pi.on("model_select", () => requestRender());
  pi.on("thinking_level_select", () => requestRender());
}
