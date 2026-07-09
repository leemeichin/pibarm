import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const PARAMS = Type.Object({});

type Forge = "github" | "sourcehut" | "git";

async function exec(pi: ExtensionAPI, command: string, args: string[], timeout = 10000) {
  const result = await pi.exec(command, args, { timeout });
  return { stdout: result.stdout?.trim() ?? "", stderr: result.stderr?.trim() ?? "", code: result.code };
}

function parseForge(remote: string): Forge {
  if (remote.includes("github.com")) return "github";
  if (remote.includes("git.sr.ht")) return "sourcehut";
  return "git";
}

function checkSummary(checks: any[]): string {
  if (!Array.isArray(checks) || checks.length === 0) return "ci:?";
  const bad = checks.find((c) => ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].includes(c.conclusion));
  if (bad) return "ci:fail";
  const pending = checks.find((c) => c.status && c.status !== "COMPLETED");
  if (pending) return "ci:run";
  return "ci:ok";
}

async function collect(pi: ExtensionAPI) {
  const branch = (await exec(pi, "git", ["branch", "--show-current"])).stdout || "detached";
  const short = (await exec(pi, "git", ["status", "--short"])).stdout;
  const dirty = short ? short.split("\n").filter(Boolean).length : 0;
  const remote = (await exec(pi, "git", ["remote", "get-url", "origin"])).stdout;
  const forge = parseForge(remote);
  const parts = [`git:${branch}${dirty ? ` ±${dirty}` : ""}`];
  const details: Record<string, unknown> = { branch, dirty, forge };

  if (forge === "github") {
    const pr = await exec(pi, "gh", ["pr", "view", "--json", "number,isDraft,statusCheckRollup,url"], 15000);
    if (pr.code === 0 && pr.stdout) {
      const parsed = JSON.parse(pr.stdout);
      parts.push(`PR #${parsed.number}${parsed.isDraft ? " draft" : ""}`);
      parts.push(checkSummary(parsed.statusCheckRollup));
      details.github = parsed;
    } else {
      const run = await exec(pi, "gh", ["run", "list", "--branch", branch, "--limit", "1", "--json", "status,conclusion,url"], 15000);
      if (run.code === 0 && run.stdout) {
        const parsed = JSON.parse(run.stdout)[0];
        if (parsed) {
          const status = parsed.status !== "completed" ? "ci:run" : parsed.conclusion === "success" ? "ci:ok" : "ci:fail";
          parts.push(status);
          details.githubRun = parsed;
        }
      }
    }
  } else if (forge === "sourcehut") {
    parts.push("sr.ht");
  }

  return { status: parts.join(" | "), details };
}

async function refresh(pi: ExtensionAPI, ctx: ExtensionContext) {
  try {
    const status = await collect(pi);
    ctx.ui.setStatus("repo", status.status);
    return status;
  } catch (error) {
    ctx.ui.setStatus("repo", undefined);
    return { status: "", details: { error: (error as Error).message } };
  }
}

export default function repoStatusExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "repo_status",
    label: "Repo Status",
    description: "Summarize current git branch, dirty files, forge, PR, and CI status.",
    promptSnippet: "Inspect current repository, PR, and CI status",
    promptGuidelines: ["Use repo_status when the user asks for repository, PR, or CI status at a glance."],
    parameters: PARAMS,
    async execute(_id, _params, _signal, _update, ctx) {
      const status = await refresh(pi, ctx);
      return { content: [{ type: "text", text: status.status || JSON.stringify(status.details) }], details: status.details };
    },
  });

  pi.registerCommand("repo-status", {
    description: "Show git/forge/CI status and update the statusline",
    handler: async (_args, ctx) => {
      const status = await refresh(pi, ctx);
      ctx.ui.notify(status.status || JSON.stringify(status.details), "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => { await refresh(pi, ctx); });
  pi.on("turn_end", async (_event, ctx) => { await refresh(pi, ctx); });
}
