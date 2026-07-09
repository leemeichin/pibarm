import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { basename, dirname, join } from "node:path";

const READ_ONLY_TOOLS = ["read", "bash", "grep", "find", "ls", "mcporter_list", "mcporter_resource", "elicit_plan_questions", "create_git_worktree"];
const WRITE_TOOLS = new Set(["edit", "write"]);

const ELICIT_PARAMS = Type.Object({
  questions: Type.Array(Type.String(), { description: "Specific questions to ask before finalizing or executing a plan" }),
  context: Type.Optional(Type.String({ description: "Short context explaining why these answers are needed" })),
});

const WORKTREE_PARAMS = Type.Object({
  name: Type.String({ description: "Short slug/name for the worktree and branch" }),
  baseRef: Type.Optional(Type.String({ description: "Git ref to branch from. Defaults to HEAD" })),
});

const WORKTREE_AGENT_PARAMS = Type.Object({
  task: Type.String({ description: "Self-contained task for the subagent to run in an isolated git worktree" }),
  name: Type.String({ description: "Short slug/name for the worktree and branch" }),
  model: Type.Optional(Type.String({ description: "Optional pi model pattern for the subagent" })),
  baseRef: Type.Optional(Type.String({ description: "Git ref to branch from. Defaults to HEAD" })),
  timeoutMs: Type.Optional(Type.Number({ description: "Timeout in milliseconds" })),
});

const WORKTREE_DIFF_PARAMS = Type.Object({
  path: Type.String({ description: "Path to the git worktree to summarize" }),
  statOnly: Type.Optional(Type.Boolean({ description: "Only return --stat output" })),
});

const WORKTREE_REMOVE_PARAMS = Type.Object({
  path: Type.String({ description: "Path to the git worktree to remove" }),
  force: Type.Optional(Type.Boolean({ description: "Pass --force to git worktree remove" })),
});

function slugify(input: string): string {
  const slug = input.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return slug || `task-${Date.now()}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function isReadOnlyCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return true;
  if (/[;&|`]\s*(rm|mv|cp|chmod|chown|mkdir|rmdir|touch|tee|python|node|npm|pnpm|yarn|bun|make|cargo|go|git\s+(add|commit|checkout|switch|reset|clean|apply|am|merge|rebase|worktree\s+(add|remove|prune)|stash\s+(push|pop|apply)))/.test(trimmed)) {
    return false;
  }
  return /^(pwd|ls|find|rg|grep|cat|head|tail|wc|sed\s+-n|awk|git\s+(status|diff|log|show|branch|rev-parse|worktree\s+list)\b)/.test(trimmed);
}

function looksLikePlan(text: string): boolean {
  return /(^|\n)\s*(Plan|Proposed plan|Implementation plan)\s*:/i.test(text) || /(^|\n)\s*\d+\.\s+/.test(text);
}

function extractPlanSteps(text: string): string[] {
  return text
    .split("\n")
    .map((line) => /^\s*\d+[.)]\s+(.+?)\s*$/.exec(line)?.[1])
    .filter((step): step is string => Boolean(step));
}

function assistantText(messages: any[]): string {
  const last = [...messages].reverse().find((m) => m.role === "assistant" && Array.isArray(m.content));
  if (!last) return "";
  return last.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
}

async function gitRoot(pi: ExtensionAPI): Promise<string> {
  const rootResult = await pi.exec("git", ["rev-parse", "--show-toplevel"], { timeout: 10000 });
  const root = rootResult.stdout.trim();
  if (!root || rootResult.code !== 0) throw new Error("Not inside a git repository");
  return root;
}

async function createWorktree(pi: ExtensionAPI, cwd: string, name: string, baseRef = "HEAD") {
  const root = await gitRoot(pi);

  const slug = slugify(name);
  const parent = dirname(root);
  const repo = basename(root);
  const path = join(parent, `${repo}-worktree-${slug}`);
  const branch = `pibarm/${slug}`;
  const result = await pi.exec("git", ["-C", root, "worktree", "add", "-b", branch, path, baseRef], { timeout: 30000 });
  if (result.code !== 0 && /already exists|is already checked out/i.test(result.stderr ?? "")) {
    return { root, path, branch, reused: true, stdout: result.stdout, stderr: result.stderr };
  }
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || "git worktree add failed");
  return { root, path, branch, reused: false, stdout: result.stdout, stderr: result.stderr };
}

async function listWorktrees(pi: ExtensionAPI) {
  const root = await gitRoot(pi);
  const result = await pi.exec("git", ["-C", root, "worktree", "list", "--porcelain"], { timeout: 10000 });
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || "git worktree list failed");
  const worktrees: Array<{ path: string; branch?: string; head?: string; bare?: boolean; detached?: boolean }> = [];
  let current: { path: string; branch?: string; head?: string; bare?: boolean; detached?: boolean } | undefined;
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) worktrees.push(current);
      current = { path: line.slice("worktree ".length) };
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    } else if (current && line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (current && line === "bare") {
      current.bare = true;
    } else if (current && line === "detached") {
      current.detached = true;
    }
  }
  if (current) worktrees.push(current);
  return { root, worktrees };
}

async function summarizeWorktree(pi: ExtensionAPI, path: string, statOnly = false) {
  const status = await pi.exec("git", ["-C", path, "status", "--short", "--branch"], { timeout: 10000 });
  const stat = await pi.exec("git", ["-C", path, "diff", "--stat"], { timeout: 10000 });
  const diff = statOnly ? undefined : await pi.exec("git", ["-C", path, "diff", "--", ":!package-lock.json", ":!pnpm-lock.yaml", ":!yarn.lock"], { timeout: 30000 });
  return {
    path,
    status: status.stdout.trim(),
    stat: stat.stdout.trim(),
    diff: diff?.stdout.trim(),
    code: Math.max(status.code ?? 0, stat.code ?? 0, diff?.code ?? 0),
  };
}

export default function planWorktree(pi: ExtensionAPI) {
  let planMode = false;
  let toolsBeforePlan: string[] | undefined;
  let lastPlan = "";
  let planSteps: string[] = [];

  function updatePlanWidget(ctx: ExtensionContext) {
    if (!planMode || planSteps.length === 0) {
      ctx.ui.setWidget("pibarm-plan-steps", undefined);
      return;
    }
    ctx.ui.setWidget("pibarm-plan-steps", planSteps.map((step, index) => `${index + 1}. ${step}`));
  }

  function enablePlanMode(ctx: ExtensionContext) {
    if (!toolsBeforePlan) toolsBeforePlan = pi.getActiveTools();
    pi.setActiveTools([...new Set([...toolsBeforePlan.filter((t) => !WRITE_TOOLS.has(t)), ...READ_ONLY_TOOLS])]);
    planMode = true;
    ctx.ui.setStatus("pibarm-plan", "plan");
    updatePlanWidget(ctx);
    ctx.ui.notify("Plan mode enabled: write tools disabled, bash is read-only.", "info");
  }

  function disablePlanMode(ctx: ExtensionContext) {
    if (toolsBeforePlan) pi.setActiveTools(toolsBeforePlan);
    toolsBeforePlan = undefined;
    planMode = false;
    ctx.ui.setStatus("pibarm-plan", undefined);
    ctx.ui.setWidget("pibarm-plan-steps", undefined);
    ctx.ui.notify("Plan mode disabled.", "info");
  }

  pi.registerCommand("plan", {
    description: "Enter eliciting read-only plan mode and ask for a plan",
    handler: async (args, ctx) => {
      enablePlanMode(ctx);
      const task = args.trim();
      if (task) {
        await ctx.sendUserMessage(`Plan this task. Ask clarifying questions first if needed. Do not edit files.\n\nTask: ${task}`);
      }
    },
  });

  pi.registerCommand("plan-mode", {
    description: "Toggle read-only plan mode",
    handler: async (_args, ctx) => planMode ? disablePlanMode(ctx) : enablePlanMode(ctx),
  });

  pi.registerCommand("plan-show", {
    description: "Show the last captured plan and parsed steps",
    handler: async (_args, ctx) => {
      if (!lastPlan) {
        ctx.ui.notify("No captured plan yet. Use /plan first.", "warning");
        return;
      }
      const steps = planSteps.length ? `\n\nParsed steps:\n${planSteps.map((step, i) => `${i + 1}. ${step}`).join("\n")}` : "";
      ctx.ui.notify(`${lastPlan}${steps}`, "info");
    },
  });

  pi.registerCommand("execute-plan", {
    description: "Execute the last approved plan; add 'worktree <name>' to isolate changes",
    handler: async (args, ctx) => {
      if (!lastPlan) {
        ctx.ui.notify("No captured plan yet. Use /plan first.", "warning");
        return;
      }
      const match = /^worktree\s+(.+)/i.exec(args.trim());
      disablePlanMode(ctx);
      if (match) {
        const wt = await createWorktree(pi, ctx.cwd, match[1]);
        await ctx.sendUserMessage(`Execute the approved plan in the isolated git worktree at ${wt.path}. Make all file changes under that path, not the active repo.\n\nApproved plan:\n${lastPlan}`);
      } else {
        await ctx.sendUserMessage(`Execute the approved plan in the active checkout.\n\nApproved plan:\n${lastPlan}`);
      }
    },
  });

  pi.registerCommand("worktrees", {
    description: "List git worktrees for this repository",
    handler: async (_args, ctx) => {
      try {
        const { worktrees } = await listWorktrees(pi);
        const text = worktrees.map((wt) => `${wt.path}${wt.branch ? `  [${wt.branch}]` : ""}${wt.detached ? "  (detached)" : ""}`).join("\n");
        ctx.ui.notify(text || "No worktrees found", "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("worktree-diff", {
    description: "Show status and diff stat for a worktree: /worktree-diff <path>",
    handler: async (args, ctx) => {
      const path = args.trim();
      if (!path) {
        ctx.ui.notify("Usage: /worktree-diff <path>", "warning");
        return;
      }
      try {
        const summary = await summarizeWorktree(pi, path, true);
        ctx.ui.notify([summary.status, summary.stat].filter(Boolean).join("\n\n") || "No changes", "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("worktree-remove", {
    description: "Remove a git worktree: /worktree-remove [--force] <path>",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const force = parts[0] === "--force";
      const path = force ? parts.slice(1).join(" ") : parts.join(" ");
      if (!path) {
        ctx.ui.notify("Usage: /worktree-remove [--force] <path>", "warning");
        return;
      }
      if (ctx.hasUI) {
        const ok = await ctx.ui.confirm("Remove worktree?", `${path}${force ? "\n\nUsing --force." : ""}`);
        if (!ok) return;
      }
      const root = await gitRoot(pi);
      const result = await pi.exec("git", ["-C", root, "worktree", "remove", ...(force ? ["--force"] : []), path], { timeout: 30000 });
      ctx.ui.notify(result.code === 0 ? `Removed ${path}` : (result.stderr || result.stdout || "remove failed"), result.code === 0 ? "info" : "error");
    },
  });

  pi.registerTool({
    name: "elicit_plan_questions",
    label: "Elicit Plan Questions",
    description: "Ask the user specific questions before finalizing or executing a plan.",
    promptSnippet: "Ask the user clarifying questions for plan elicitation",
    promptGuidelines: ["Use elicit_plan_questions in plan mode before finalizing a plan when requirements, risks, scope, or execution location are unclear."],
    parameters: ELICIT_PARAMS,
    async execute(_id, params, _signal, _update, ctx) {
      if (!ctx.hasUI) {
        return { content: [{ type: "text", text: `Questions needing answers:\n${params.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}` }] };
      }
      const prompt = `${params.context ? `${params.context}\n\n` : ""}${params.questions.map((q, i) => `${i + 1}. ${q}\nAnswer: `).join("\n\n")}`;
      const answer = await ctx.ui.editor("Answer plan questions", prompt);
      return {
        content: [{ type: "text", text: answer?.trim() ? `User answered:\n${answer.trim()}` : "User did not provide answers." }],
        details: { questions: params.questions, answer },
      };
    },
  });

  pi.registerTool({
    name: "create_git_worktree",
    label: "Create Git Worktree",
    description: "Create an isolated git worktree for safe execution without modifying the active checkout.",
    promptSnippet: "Create an isolated git worktree for implementation or subagent work",
    promptGuidelines: ["Use create_git_worktree before executing risky or parallel work that should not touch the active checkout."],
    parameters: WORKTREE_PARAMS,
    async execute(_id, params, _signal, _update, ctx) {
      const wt = await createWorktree(pi, ctx.cwd, params.name, params.baseRef ?? "HEAD");
      return { content: [{ type: "text", text: `Worktree ready: ${wt.path}\nBranch: ${wt.branch}${wt.reused ? "\n(reused existing worktree/branch)" : ""}` }], details: wt };
    },
  });

  pi.registerTool({
    name: "summarize_worktree_diff",
    label: "Summarize Worktree Diff",
    description: "Return git status, diff stat, and optionally diff for a worktree.",
    promptSnippet: "Summarize changes in an isolated git worktree",
    promptGuidelines: ["Use summarize_worktree_diff after worktree execution to report changed files and review the diff before merge."],
    parameters: WORKTREE_DIFF_PARAMS,
    async execute(_id, params) {
      const summary = await summarizeWorktree(pi, params.path, params.statOnly ?? false);
      const text = [
        `Status:\n${summary.status || "(clean)"}`,
        `Diff stat:\n${summary.stat || "(none)"}`,
        summary.diff && `Diff:\n${summary.diff}`,
      ].filter(Boolean).join("\n\n");
      return { content: [{ type: "text", text }], details: summary, isError: summary.code !== 0 };
    },
  });

  pi.registerTool({
    name: "remove_git_worktree",
    label: "Remove Git Worktree",
    description: "Remove a git worktree after review/merge or abandoned work.",
    promptSnippet: "Remove an isolated git worktree",
    promptGuidelines: ["Use remove_git_worktree only after the user confirms the worktree is no longer needed."],
    parameters: WORKTREE_REMOVE_PARAMS,
    async execute(_id, params) {
      const root = await gitRoot(pi);
      const result = await pi.exec("git", ["-C", root, "worktree", "remove", ...(params.force ? ["--force"] : []), params.path], { timeout: 30000 });
      return {
        content: [{ type: "text", text: result.code === 0 ? `Removed ${params.path}` : (result.stderr || result.stdout || "remove failed") }],
        details: result,
        isError: result.code !== 0,
      };
    },
  });

  pi.registerTool({
    name: "run_worktree_agent",
    label: "Run Worktree Agent",
    description: "Create an isolated git worktree and run a non-interactive pi subagent inside it.",
    promptSnippet: "Run a subagent in a separate git worktree",
    promptGuidelines: ["Use run_worktree_agent for parallel implementation, verification, or exploratory changes that must not affect the active checkout."],
    parameters: WORKTREE_AGENT_PARAMS,
    async execute(_id, params, signal, _update, ctx) {
      const wt = await createWorktree(pi, ctx.cwd, params.name, params.baseRef ?? "HEAD");
      const piArgs = ["-p"];
      if (params.model) piArgs.push("--model", params.model);
      piArgs.push(params.task);
      const command = `cd ${shellQuote(wt.path)} && pi ${piArgs.map(shellQuote).join(" ")}`;
      const result = await pi.exec("bash", ["-lc", command], { signal, timeout: params.timeoutMs ?? 600000 });
      const text = [result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n\n--- stderr ---\n");
      return { content: [{ type: "text", text: text || `(subagent exited ${result.code})` }], details: { worktree: wt, result }, isError: result.code !== 0 };
    },
  });

  pi.on("tool_call", async (event) => {
    if (!planMode) return;
    if (WRITE_TOOLS.has(event.toolName)) return { block: true, reason: "Plan mode is read-only. Approve/execute the plan before editing files." };
    if (event.toolName === "bash" && !isReadOnlyCommand(String((event.input as any).command ?? ""))) {
      return { block: true, reason: "Plan mode blocks non-read-only bash commands. Use /execute-plan or create a worktree after approval." };
    }
  });

  pi.on("before_agent_start", async () => {
    if (!planMode) return;
    return {
      message: {
        customType: "pibarm-plan-mode",
        display: false,
        content: `PLAN MODE IS ACTIVE.\n- Do not modify files.\n- Prefer reading, inspection, mcporter discovery, and analysis.\n- If requirements are unclear, call elicit_plan_questions before presenting the final plan.\n- Present the final answer as a concise plan with risks, open questions, and validation steps.\n- Recommend whether execution should happen in a git worktree.`,
      },
    };
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!planMode || !ctx.hasUI) return;
    const text = assistantText(event.messages as any[]);
    if (!looksLikePlan(text)) return;
    lastPlan = text;
    planSteps = extractPlanSteps(text);
    updatePlanWidget(ctx);
    pi.appendEntry("pibarm-plan", { plan: lastPlan, steps: planSteps, capturedAt: Date.now() });
    const choice = await ctx.ui.select("Plan captured. What next?", [
      "Ask/refine before executing",
      "Approve: execute in a git worktree",
      "Approve: execute in active checkout",
      "Stay in plan mode",
    ]);
    if (choice?.startsWith("Ask")) {
      const refinement = await ctx.ui.editor("Questions/refinements for the plan", "Ask any follow-up questions or changes you want before execution:\n");
      if (refinement?.trim()) pi.sendUserMessage(refinement.trim(), { deliverAs: "followUp" });
    } else if (choice?.includes("worktree")) {
      const name = await ctx.ui.input("Worktree name", "plan-work");
      if (name?.trim()) pi.sendUserMessage(`/execute-plan worktree ${name.trim()}`, { deliverAs: "followUp" });
    } else if (choice?.includes("active")) {
      pi.sendUserMessage("/execute-plan", { deliverAs: "followUp" });
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    const restored = ctx.sessionManager.getEntries()
      .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === "pibarm-plan")
      .pop() as { data?: { plan?: string; steps?: string[] } } | undefined;
    if (restored?.data?.plan) lastPlan = restored.data.plan;
    if (restored?.data?.steps) planSteps = restored.data.steps;
    updatePlanWidget(ctx);
  });
}
