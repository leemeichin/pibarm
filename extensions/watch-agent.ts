import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { selectAgentModelRef } from "../lib/current-model.js";
import { finishAgentTask, removeAgentTask, upsertAgentTask, updateTaskWidget } from "../lib/task-widget.js";

const WATCH_AGENT_PARAMS = Type.Object({
  action: Type.Optional(StringEnum(["start", "stop", "list"] as const, { description: "Start, stop, or list watcher agents. Defaults to start." })),
  name: Type.Optional(Type.String({ description: "Short watcher name. Defaults to pr-watch or watch." })),
  task: Type.Optional(Type.String({ description: "What the watcher should do when observed state changes. Alias/legacy form of goal." })),
  goal: Type.Optional(Type.String({ description: "Claude Code-style goal: the outcome the watcher should work toward when changes are observed." })),
  loop: Type.Optional(Type.String({ description: "Claude Code-style loop: recurring instructions for each poll/change cycle." })),
  pr: Type.Optional(Type.String({ description: "GitHub PR number or URL to watch. Builds a gh pr view command when watchCommand is omitted." })),
  watchCommand: Type.Optional(Type.String({ description: "Shell command whose output is polled for changes" })),
  intervalSeconds: Type.Optional(Type.Number({ description: "Poll interval. Defaults to 300 seconds." })),
  maxIterations: Type.Optional(Type.Number({ description: "Optional maximum polling iterations before stopping" })),
  model: Type.Optional(Type.String({ description: "Optional pi model pattern. Defaults to current/heuristic model selection." })),
  tools: Type.Optional(Type.Array(Type.String(), { description: "Optional tool allowlist for watcher pi invocations" })),
});

type WatchParams = {
  action?: "start" | "stop" | "list";
  name?: string;
  task?: string;
  goal?: string;
  loop?: string;
  pr?: string;
  watchCommand?: string;
  intervalSeconds?: number;
  maxIterations?: number;
  model?: string;
  tools?: string[];
};

type Watcher = {
  name: string;
  pid: number;
  dir: string;
  logPath: string;
  stopPath: string;
  taskId: string;
  model?: string;
  startedAt: number;
};

const watchers = new Map<string, Watcher>();

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "watch";
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function modelLabel(model: string | undefined) {
  return model?.split("/").pop()?.replace(/^claude-/, "") ?? "default";
}

async function gitRoot(pi: ExtensionAPI, cwd: string) {
  const result = await pi.exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { timeout: 10000 });
  return result.code === 0 && result.stdout.trim() ? result.stdout.trim() : cwd;
}

function defaultWatchCommand(pr: string | undefined) {
  if (!pr) return undefined;
  return `gh pr view ${shellQuote(pr)} --json number,title,state,isDraft,reviewDecision,mergeStateStatus,statusCheckRollup,comments,reviews`;
}

function watcherPrompt(goal: string, loop: string, watchCommand: string) {
  return `You are a watcher sibling agent. A parent Pi session is still active, but you are responsible for monitoring external state and responding only when useful.\n\nGoal:\n${goal}\n\nLoop:\n${loop}\n\nObserved state comes from this command:\n${watchCommand}\n\nWhen observed state changes, run the loop instructions against the latest state and take the smallest appropriate action toward the goal. If this is a pull request watcher, look for new review comments, failed checks, or requested changes. Respond via available tools/CLI only when the goal/loop explicitly allows it; otherwise summarize what changed in your log.`;
}

async function startWatcher(pi: ExtensionAPI, ctx: ExtensionContext, params: WatchParams) {
  const watchCommand = params.watchCommand ?? defaultWatchCommand(params.pr);
  if (!watchCommand) throw new Error("watch_agent start requires either pr or watchCommand");
  const goal = params.goal ?? params.task ?? (params.pr ? `Watch PR ${params.pr} for review comments, failed checks, and requested changes. If safe and clearly requested, respond or update the PR; otherwise log a concise summary.` : "Watch for changes and respond if action is needed.");
  const loop = params.loop ?? (params.pr ? "Poll the PR state. On each change, inspect reviews, comments, reviewDecision, and statusCheckRollup. Identify only new/actionable changes since the previous observation." : "Poll the watched state. On each change, inspect the latest output and decide whether action is needed.");
  const name = slug(params.name ?? (params.pr ? `pr-${params.pr}` : "watch"));
  const root = await gitRoot(pi, ctx.cwd);
  const dir = join(root, ".pi", "watchers", `${name}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  const logPath = join(dir, "watch.log");
  const stopPath = join(dir, "stop");
  const scriptPath = join(dir, "watch.sh");
  const promptPath = join(dir, "prompt.md");
  const modelSelection = selectAgentModelRef(ctx, params.model, `${goal}\n${loop}`);
  const piArgs = ["pi", "-p", "--no-session"];
  if (modelSelection.model) piArgs.push("--model", modelSelection.model);
  if (params.tools?.length) piArgs.push("--tools", params.tools.join(","));
  piArgs.push(`@${promptPath}`);

  await writeFile(promptPath, watcherPrompt(goal, loop, watchCommand), "utf8");
  const maxIterations = Math.max(0, Math.floor(params.maxIterations ?? 0));
  const interval = Math.max(15, Math.floor(params.intervalSeconds ?? 300));
  const piCommand = piArgs.map(shellQuote).join(" ");
  const script = `#!/usr/bin/env bash
set -u
last_hash=""
iteration=0
printf '[watcher ${name} started]\\nlog: ${logPath}\\ncommand: %s\\n' ${shellQuote(watchCommand)} >> ${shellQuote(logPath)}
while [ ! -f ${shellQuote(stopPath)} ]; do
  iteration=$((iteration + 1))
  output="$(${watchCommand} 2>&1)"
  hash="$(printf '%s' "$output" | shasum -a 256 | awk '{print $1}')"
  if [ "$hash" != "$last_hash" ]; then
    last_hash="$hash"
    observation=${shellQuote(join(dir, "observation.md"))}
    {
      printf '# Watcher observation: ${name}\\n\\n'
      printf 'Iteration: %s\\n\\n' "$iteration"
      printf '## Watch command\\n\\n%s\\n\\n' ${shellQuote(watchCommand)}
      printf '## Output\\n\\n\`\`\`text\\n%s\\n\`\`\`\\n' "$output"
    } > "$observation"
    {
      printf '\\n[watcher ${name} change detected iteration %s]\\n' "$iteration"
      printf '%s\\n' "$output"
      printf '\\n[watcher ${name} agent run]\\n'
    } >> ${shellQuote(logPath)}
    ${piCommand} "@$observation" >> ${shellQuote(logPath)} 2>&1
  fi
  if [ ${maxIterations} -gt 0 ] && [ "$iteration" -ge ${maxIterations} ]; then
    break
  fi
  sleep ${interval}
done
printf '\\n[watcher ${name} stopped]\\n' >> ${shellQuote(logPath)}
`;
  await writeFile(scriptPath, script, { encoding: "utf8", mode: 0o700 });
  const result = await pi.exec("bash", ["-lc", `cd ${shellQuote(ctx.cwd)} && nohup bash ${shellQuote(scriptPath)} >/dev/null 2>&1 & echo $!`], { timeout: 10000 });
  const pid = Number(result.stdout.trim().split(/\s+/).pop());
  if (!Number.isFinite(pid) || pid <= 0) throw new Error(result.stderr || result.stdout || "failed to start watcher");

  const taskId = `watch:${name}`;
  watchers.set(name, { name, pid, dir, logPath, stopPath, taskId, model: modelSelection.model, startedAt: Date.now() });
  upsertAgentTask({ id: taskId, label: `watch ${name}`, status: "running", session: modelLabel(modelSelection.model), detail: params.pr ? `PR ${params.pr}` : undefined });
  updateTaskWidget(ctx);
  return { name, pid, dir, logPath, stopPath, modelSelection };
}

async function stopWatcher(pi: ExtensionAPI, ctx: ExtensionContext, name: string | undefined) {
  const targetName = name ? slug(name) : undefined;
  const targets = targetName ? [watchers.get(targetName)].filter(Boolean) as Watcher[] : Array.from(watchers.values());
  if (!targets.length) return "No matching watchers.";
  for (const watcher of targets) {
    await writeFile(watcher.stopPath, "stop\n", "utf8").catch(() => undefined);
    await pi.exec("bash", ["-lc", `kill ${watcher.pid} >/dev/null 2>&1 || true`], { timeout: 5000 }).catch(() => undefined);
    finishAgentTask(watcher.taskId, "done", "stopped");
    removeAgentTask(watcher.taskId);
    watchers.delete(watcher.name);
  }
  updateTaskWidget(ctx);
  return `Stopped ${targets.map((watcher) => watcher.name).join(", ")}.`;
}

function listWatchers() {
  const rows = Array.from(watchers.values()).map((watcher) => `${watcher.name}: pid ${watcher.pid} log ${watcher.logPath}`);
  return rows.length ? rows.join("\n") : "No watchers.";
}

export default function watchAgentExtension(pi: ExtensionAPI) {
  pi.registerCommand("watchers", {
    description: "List active watcher sibling agents",
    handler: async (_args, ctx) => ctx.ui.notify(listWatchers(), "info"),
  });

  pi.registerCommand("watcher-stop", {
    description: "Stop watcher sibling agents: /watcher-stop [name]",
    handler: async (args, ctx) => ctx.ui.notify(await stopWatcher(pi, ctx, args.trim() || undefined), "info"),
  });

  pi.registerTool({
    name: "watch_agent",
    label: "Watch Agent",
    description: "Start, stop, or list a sibling watcher agent that polls external state and runs pi when it changes.",
    promptSnippet: "Start a sibling watcher agent for PR reviews, checks, or external task changes",
    promptGuidelines: ["Use watch_agent when the user asks to watch a PR, review comments, checks, or another external process while the parent Pi session stays active."],
    parameters: WATCH_AGENT_PARAMS,
    async execute(_id, params, _signal, _update, ctx) {
      const action = params.action ?? "start";
      if (action === "list") return { content: [{ type: "text", text: listWatchers() }], details: { watchers: Array.from(watchers.values()) } };
      if (action === "stop") return { content: [{ type: "text", text: await stopWatcher(pi, ctx, params.name) }], details: { watchers: Array.from(watchers.values()) } };
      const watcher = await startWatcher(pi, ctx, params);
      return { content: [{ type: "text", text: `Watcher started: ${watcher.name}\nPID: ${watcher.pid}\nLog: ${watcher.logPath}` }], details: watcher };
    },
  });
}
