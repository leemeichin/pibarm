import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const PRS_PARAMS = Type.Object({
  state: Type.Optional(Type.String({ description: "PR state: open, closed, merged, or all. Defaults to open." })),
  limit: Type.Optional(Type.Number({ description: "Maximum PRs to return. Defaults to 10." })),
});

const PR_STATUS_PARAMS = Type.Object({
  number: Type.Optional(Type.Number({ description: "PR number. Omit for current branch PR." })),
});

const CI_PARAMS = Type.Object({
  branch: Type.Optional(Type.String({ description: "Branch/ref to inspect. Defaults to current branch." })),
  limit: Type.Optional(Type.Number({ description: "Maximum runs to return. Defaults to 5." })),
});

async function runGh(pi: ExtensionAPI, args: string[], signal?: AbortSignal) {
  const result = await pi.exec("gh", args, { signal, timeout: 30000 });
  const stdout = result.stdout?.trim() ?? "";
  const stderr = result.stderr?.trim() ?? "";
  return { args, stdout, stderr, code: result.code };
}

function text(result: { stdout: string; stderr: string; code: number | null }) {
  return result.stdout || result.stderr || `(gh exited ${result.code})`;
}

export default function githubExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "github_prs",
    label: "GitHub PRs",
    description: "List GitHub pull requests for the current repository using gh.",
    promptSnippet: "List GitHub PRs with gh",
    promptGuidelines: ["Use github_prs when the user asks about open GitHub PRs for the current repository."],
    parameters: PRS_PARAMS,
    async execute(_id, params, signal) {
      const result = await runGh(pi, ["pr", "list", "--state", params.state ?? "open", "--limit", String(params.limit ?? 10), "--json", "number,title,state,isDraft,author,headRefName,updatedAt,url"], signal);
      return { content: [{ type: "text", text: text(result) }], details: result, isError: result.code !== 0 };
    },
  });

  pi.registerTool({
    name: "github_pr_status",
    label: "GitHub PR Status",
    description: "Show current or selected GitHub PR status, review decision, and checks using gh.",
    promptSnippet: "Inspect GitHub PR status/checks with gh",
    promptGuidelines: ["Use github_pr_status when the user asks about PR review state, mergeability, or checks."],
    parameters: PR_STATUS_PARAMS,
    async execute(_id, params, signal) {
      const selector = params.number ? [String(params.number)] : [];
      const result = await runGh(pi, ["pr", "view", ...selector, "--json", "number,title,state,isDraft,mergeable,reviewDecision,statusCheckRollup,url,headRefName,baseRefName"], signal);
      return { content: [{ type: "text", text: text(result) }], details: result, isError: result.code !== 0 };
    },
  });

  pi.registerTool({
    name: "github_ci_status",
    label: "GitHub CI Status",
    description: "List recent GitHub Actions runs for the current repository using gh.",
    promptSnippet: "Inspect GitHub Actions runs with gh",
    promptGuidelines: ["Use github_ci_status when the user asks about GitHub Actions or CI runs."],
    parameters: CI_PARAMS,
    async execute(_id, params, signal) {
      const branch = params.branch ? ["--branch", params.branch] : [];
      const result = await runGh(pi, ["run", "list", ...branch, "--limit", String(params.limit ?? 5), "--json", "databaseId,displayTitle,status,conclusion,event,headBranch,url,createdAt,updatedAt"], signal);
      return { content: [{ type: "text", text: text(result) }], details: result, isError: result.code !== 0 };
    },
  });

  pi.registerCommand("gh-prs", {
    description: "List open GitHub PRs for this repo",
    handler: async (_args, ctx) => {
      const result = await runGh(pi, ["pr", "list", "--state", "open", "--limit", "10"]);
      ctx.ui.notify(text(result), result.code === 0 ? "info" : "error");
    },
  });

  pi.registerCommand("gh-ci", {
    description: "List recent GitHub Actions runs for this repo",
    handler: async (_args, ctx) => {
      const result = await runGh(pi, ["run", "list", "--limit", "5"]);
      ctx.ui.notify(text(result), result.code === 0 ? "info" : "error");
    },
  });
}
