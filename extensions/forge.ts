import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CONFIG_DIR_NAME, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const FORGES = ["github", "sourcehut"] as const;
type Forge = typeof FORGES[number];

const PRS_PARAMS = Type.Object({
  state: Type.Optional(Type.String({ description: "PR state when supported: open, closed, merged, or all. Defaults to open." })),
  limit: Type.Optional(Type.Number({ description: "Maximum rows to return. Defaults to 10." })),
});

const PR_STATUS_PARAMS = Type.Object({
  number: Type.Optional(Type.Number({ description: "PR number when supported. Omit for current branch PR." })),
});

const CI_PARAMS = Type.Object({
  branch: Type.Optional(Type.String({ description: "Branch/ref to inspect when supported. Defaults to current branch." })),
  limit: Type.Optional(Type.Number({ description: "Maximum rows to return. Defaults to 5." })),
});

const LIMIT_PARAMS = Type.Object({
  limit: Type.Optional(Type.Number({ description: "Maximum rows to return when supported. Defaults to 10." })),
});

interface ForgeConfig {
  forge?: Forge;
}

interface CommandResult {
  command: "gh" | "hut" | "git";
  forge?: Forge;
  args: string[];
  stdout: string;
  stderr: string;
  code: number | null;
}

function configPath(cwd: string) {
  return join(cwd, CONFIG_DIR_NAME, "forge.json");
}

function isForge(value: unknown): value is Forge {
  return typeof value === "string" && (FORGES as readonly string[]).includes(value);
}

async function loadForgeConfig(cwd: string): Promise<ForgeConfig> {
  try {
    const parsed = JSON.parse(await readFile(configPath(cwd), "utf8"));
    return isForge(parsed.forge) ? { forge: parsed.forge } : {};
  } catch {
    return {};
  }
}

async function saveForgeConfig(cwd: string, forge: Forge) {
  const path = configPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ forge }, null, 2)}\n`, "utf8");
}

async function clearForgeConfig(cwd: string) {
  await rm(configPath(cwd), { force: true });
}

async function run(pi: ExtensionAPI, command: "gh" | "hut" | "git", args: string[], signal?: AbortSignal): Promise<CommandResult> {
  const result = await pi.exec(command, args, { signal, timeout: 30000 });
  return {
    command,
    args,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    code: result.code,
  };
}

function resultText(result: { command?: string; stdout: string; stderr: string; code: number | null }) {
  return result.stdout || result.stderr || `(${result.command ?? "command"} exited ${result.code})`;
}

async function detectForge(pi: ExtensionAPI, cwd: string): Promise<{ forge?: Forge; remote?: string }> {
  const remote = await run(pi, "git", ["-C", cwd, "remote", "get-url", "origin"]).catch(() => undefined);
  const url = remote?.stdout ?? "";
  if (/github\.com[:/]/i.test(url)) return { forge: "github", remote: url };
  if (/git\.sr\.ht[:/]/i.test(url) || /sr\.ht/i.test(url)) return { forge: "sourcehut", remote: url };
  return { remote: url || undefined };
}

async function resolveForge(pi: ExtensionAPI, ctx: ExtensionContext): Promise<{ forge: Forge; source: "configured" | "detected" | "selected"; remote?: string }> {
  const configured = await loadForgeConfig(ctx.cwd);
  if (configured.forge) return { forge: configured.forge, source: "configured" };

  const detected = await detectForge(pi, ctx.cwd);
  if (detected.forge) return { forge: detected.forge, source: "detected", remote: detected.remote };

  if (!ctx.hasUI) throw new Error("Could not detect forge from git remote. Run /forge github or /forge sourcehut in interactive mode to remember a choice.");
  const choice = await ctx.ui.select("Which forge should pibarm use for this repository?", ["GitHub", "SourceHut"]);
  if (!choice) throw new Error("Forge selection cancelled.");
  const forge = choice === "GitHub" ? "github" : "sourcehut";
  await saveForgeConfig(ctx.cwd, forge);
  return { forge, source: "selected", remote: detected.remote };
}

async function forgeRun(pi: ExtensionAPI, ctx: ExtensionContext, signal: AbortSignal | undefined, githubArgs: string[] | undefined, hutArgs: string[] | undefined) {
  const resolved = await resolveForge(pi, ctx);
  if (resolved.forge === "github") {
    if (!githubArgs) return unsupported(resolved.forge, "This operation is not supported for GitHub yet.");
    return { ...(await run(pi, "gh", githubArgs, signal)), forge: resolved.forge };
  }
  if (!hutArgs) return unsupported(resolved.forge, "This operation is not supported for SourceHut yet.");
  return { ...(await run(pi, "hut", hutArgs, signal)), forge: resolved.forge };
}

function unsupported(forge: Forge, message: string): CommandResult {
  return { command: forge === "github" ? "gh" : "hut", forge, args: [], stdout: "", stderr: message, code: 2 };
}

function toolResult(result: CommandResult) {
  if (result.code !== 0) {
    // Throw so failures (missing CLI, unauthenticated gh, bad repo) are
    // flagged to the model; a returned isError is ignored.
    throw new Error(result.stderr || result.stdout || `${result.command} exited ${result.code}`);
  }
  return { content: [{ type: "text" as const, text: resultText(result) }], details: result };
}

export default function forgeExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "forge_prs",
    label: "Forge PRs",
    description: "List pull requests/patches for the current repository using the detected/configured forge.",
    promptSnippet: "List PRs or patches through the current repo forge",
    promptGuidelines: ["Use forge_prs instead of forge-specific tools; pibarm detects GitHub or SourceHut from the remote, or asks once and remembers."],
    parameters: PRS_PARAMS,
    async execute(_id, params, signal, _update, ctx) {
      const result = await forgeRun(
        pi,
        ctx,
        signal,
        ["pr", "list", "--state", params.state ?? "open", "--limit", String(params.limit ?? 10), "--json", "number,title,state,isDraft,author,headRefName,updatedAt,url"],
        undefined,
      );
      return toolResult(result);
    },
  });

  pi.registerTool({
    name: "forge_pr_status",
    label: "Forge PR Status",
    description: "Show current or selected PR/patch status using the detected/configured forge.",
    promptSnippet: "Inspect PR/patch review and check status through the current repo forge",
    promptGuidelines: ["Use forge_pr_status when the user asks about PR/patch review state, mergeability, or checks."],
    parameters: PR_STATUS_PARAMS,
    async execute(_id, params, signal, _update, ctx) {
      const selector = params.number ? [String(params.number)] : [];
      const result = await forgeRun(
        pi,
        ctx,
        signal,
        ["pr", "view", ...selector, "--json", "number,title,state,isDraft,mergeable,reviewDecision,statusCheckRollup,url,headRefName,baseRefName"],
        undefined,
      );
      return toolResult(result);
    },
  });

  pi.registerTool({
    name: "forge_ci_status",
    label: "Forge CI Status",
    description: "List CI/build status using the detected/configured forge.",
    promptSnippet: "Inspect CI/build status through the current repo forge",
    promptGuidelines: ["Use forge_ci_status when the user asks about CI, GitHub Actions, SourceHut builds, or failed checks."],
    parameters: CI_PARAMS,
    async execute(_id, params, signal, _update, ctx) {
      const branch = params.branch ? ["--branch", params.branch] : [];
      const result = await forgeRun(
        pi,
        ctx,
        signal,
        ["run", "list", ...branch, "--limit", String(params.limit ?? 5), "--json", "databaseId,displayTitle,status,conclusion,event,headBranch,url,createdAt,updatedAt"],
        ["builds", "list", "--count", String(params.limit ?? 10)],
      );
      return toolResult(result);
    },
  });

  pi.registerTool({
    name: "forge_tickets",
    label: "Forge Tickets",
    description: "List issues/tickets using the detected/configured forge.",
    promptSnippet: "Inspect issues or tickets through the current repo forge",
    promptGuidelines: ["Use forge_tickets when the user asks about issues, tickets, or SourceHut todo items."],
    parameters: LIMIT_PARAMS,
    async execute(_id, params, signal, _update, ctx) {
      const result = await forgeRun(
        pi,
        ctx,
        signal,
        ["issue", "list", "--limit", String(params.limit ?? 10), "--json", "number,title,state,author,updatedAt,url"],
        ["todo", "ticket", "list", "--count", String(params.limit ?? 10)],
      );
      return toolResult(result);
    },
  });

  pi.registerTool({
    name: "forge_status",
    label: "Forge Status",
    description: "Detect or show the configured forge for the current repository.",
    promptSnippet: "Detect the current repository forge",
    promptGuidelines: ["Use forge_status to understand whether forge tools will use GitHub or SourceHut."],
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _update, ctx) {
      const resolved = await resolveForge(pi, ctx);
      return { content: [{ type: "text", text: `Forge: ${resolved.forge} (${resolved.source})${resolved.remote ? `\nRemote: ${resolved.remote}` : ""}` }], details: resolved };
    },
  });

  pi.registerCommand("forge", {
    description: "Show or set repo forge: /forge [github|sourcehut|auto]",
    handler: async (args, ctx) => {
      const value = args.trim().toLowerCase();
      try {
        if (value === "github" || value === "sourcehut") {
          await saveForgeConfig(ctx.cwd, value);
          ctx.ui.notify(`Forge remembered: ${value}`, "info");
          return;
        }
        if (value === "auto" || value === "reset") {
          await clearForgeConfig(ctx.cwd);
          ctx.ui.notify("Forge config cleared; detection will use git remote next time.", "info");
          return;
        }
        const resolved = await resolveForge(pi, ctx);
        ctx.ui.notify(`Forge: ${resolved.forge} (${resolved.source})${resolved.remote ? `\nRemote: ${resolved.remote}` : ""}`, "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("forge-prs", {
    description: "List PRs/patches using the detected/configured forge",
    handler: async (_args, ctx) => {
      try {
        const result = await forgeRun(pi, ctx, undefined, ["pr", "list", "--state", "open", "--limit", "10"], undefined);
        ctx.ui.notify(resultText(result), result.code === 0 ? "info" : "error");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("forge-ci", {
    description: "List CI/builds using the detected/configured forge",
    handler: async (_args, ctx) => {
      try {
        const result = await forgeRun(pi, ctx, undefined, ["run", "list", "--limit", "5"], ["builds", "list", "--count", "10"]);
        ctx.ui.notify(resultText(result), result.code === 0 ? "info" : "error");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("forge-tickets", {
    description: "List issues/tickets using the detected/configured forge",
    handler: async (_args, ctx) => {
      try {
        const result = await forgeRun(pi, ctx, undefined, ["issue", "list", "--limit", "10"], ["todo", "ticket", "list", "--count", "10"]);
        ctx.ui.notify(resultText(result), result.code === 0 ? "info" : "error");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });
}
