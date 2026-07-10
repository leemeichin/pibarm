import { basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const PARAMS = Type.Object({});

type Forge = "github" | "sourcehut" | "git";
type Tone = "dim" | "muted" | "success" | "warning" | "error" | "accent";
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
  if (pr.state === "MERGED") return { text, tone: "accent" };
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

function modelLabel(ctx: ExtensionContext): string {
  if (!ctx.model) return "󰚩 no model";
  const id = ctx.model.id
    .replace(/^claude-/, "")
    .replace(/^gpt-/, "gpt ")
    .replace(/-/g, " ")
    .replace(/\b(sonnet|haiku|opus)\b/i, (m) => m[0]!.toUpperCase() + m.slice(1));
  return `󰚩 ${ctx.model.provider}/${id}`;
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

async function collect(pi: ExtensionAPI) {
  const branch = (await exec(pi, "git", ["branch", "--show-current"])).stdout || "detached";
  const short = (await exec(pi, "git", ["status", "--short"])).stdout;
  const dirty = short ? short.split("\n").filter(Boolean).length : 0;
  const remote = (await exec(pi, "git", ["remote", "get-url", "origin"])).stdout;
  const forge = parseForge(remote);
  const rightParts: StatusPart[] = [{ text: ` ${branch}${dirty ? ` ±${dirty}` : ""}`, tone: dirty ? "warning" : "success" }];
  const details: Record<string, unknown> = { branch, dirty, forge };

  if (forge === "github") {
    const pr = await exec(pi, "gh", ["pr", "view", "--json", "number,state,isDraft,statusCheckRollup,url"], 15000);
    if (pr.code === 0 && pr.stdout) {
      const parsed = JSON.parse(pr.stdout);
      rightParts.push(prPart(parsed));
      rightParts.push(checkSummary(parsed.statusCheckRollup));
      details.github = parsed;
    } else {
      const run = await exec(pi, "gh", ["run", "list", "--branch", branch, "--limit", "1", "--json", "status,conclusion,url"], 15000);
      if (run.code === 0 && run.stdout) {
        const parsed = JSON.parse(run.stdout)[0];
        if (parsed) {
          rightParts.push(runSummary(parsed));
          details.githubRun = parsed;
        }
      }
    }
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
          const leftParts: StatusPart[] = [
            { text: ` ${basename(ctx.cwd)}`, tone: "accent" },
            { text: modelLabel(ctx), tone: "muted" },
            { text: contextLabel(ctx), tone: "warning" },
          ];
          const thinking = thinkingLabel(pi);
          if (thinking) leftParts.push({ text: thinking, tone: "accent" });
          if (statusText) leftParts.push({ text: ` ${statusText}`, tone: "dim" });

          const left = renderSegments(leftParts, theme);
          const right = rightStatusParts.length > 0
            ? renderSegments(rightStatusParts, theme)
            : theme.fg("dim", rightStatus);
          const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
          return [truncateToWidth(left + pad + right, width)];
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

  pi.on("session_start", async (_event, ctx) => {
    installFooter(ctx);
    const status = await refresh(pi, ctx, requestRender);
    rightStatus = status.right;
    rightStatusParts = status.rightParts;
    requestRender();
  });
  pi.on("turn_end", async (_event, ctx) => {
    const status = await refresh(pi, ctx, requestRender);
    rightStatus = status.right;
    rightStatusParts = status.rightParts;
    requestRender();
  });
  pi.on("model_select", () => requestRender());
  pi.on("thinking_level_select", () => requestRender());
}
