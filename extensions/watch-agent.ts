import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import { CONFIG_DIR_NAME, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { selectAgentModelRef } from "../lib/current-model.js";
import { finishAgentTask, upsertAgentTask, updateTaskWidget } from "../lib/task-widget.js";
import { clipTail } from "../lib/tool-output.js";

const WATCH_AGENT_PARAMS = Type.Object({
  action: Type.Optional(
    StringEnum(["start", "stop", "list"] as const, {
      description: "Start, stop, or list watcher agents. Defaults to start.",
    }),
  ),
  name: Type.Optional(Type.String({ description: "Short watcher name. Defaults to pr-watch or watch." })),
  task: Type.Optional(
    Type.String({ description: "What the watcher should do when observed state changes. Alias/legacy form of goal." }),
  ),
  goal: Type.Optional(
    Type.String({
      description: "Claude Code-style goal: the outcome the watcher should work toward when changes are observed.",
    }),
  ),
  loop: Type.Optional(
    Type.String({ description: "Claude Code-style loop: recurring instructions for each poll/change cycle." }),
  ),
  pr: Type.Optional(
    Type.String({
      description: "PR number or URL to watch. Uses forge-native PR/CI status when watchCommand is omitted.",
    }),
  ),
  watchCommand: Type.Optional(Type.String({ description: "Shell command whose output is polled for changes" })),
  intervalSeconds: Type.Optional(Type.Number({ description: "Poll interval. Defaults to 300 seconds." })),
  maxIterations: Type.Optional(Type.Number({ description: "Optional maximum polling iterations before stopping" })),
  model: Type.Optional(
    Type.String({ description: "Optional pi model pattern. Defaults to current/heuristic model selection." }),
  ),
  tools: Type.Optional(
    Type.Array(Type.String(), { description: "Optional tool allowlist for watcher pi invocations" }),
  ),
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
  statusPath: string;
  feedbackDir: string;
  taskId: string;
  model?: string;
  startedAt: number;
};

const watchers = new Map<string, Watcher>();

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "watch"
  );
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function modelLabel(model: string | undefined) {
  return (
    model
      ?.split("/")
      .pop()
      ?.replace(/^claude-/, "") ?? "default"
  );
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function gitRoot(pi: ExtensionAPI, cwd: string) {
  const result = await pi.exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { timeout: 10000 });
  return result.code === 0 && result.stdout.trim() ? result.stdout.trim() : cwd;
}

async function forgeHint(pi: ExtensionAPI, cwd: string) {
  try {
    const configured = JSON.parse(await readFile(join(cwd, CONFIG_DIR_NAME, "forge.json"), "utf8"));
    if (configured.forge === "github" || configured.forge === "sourcehut") return configured.forge;
  } catch {
    // Fall back to the origin remote.
  }
  const result = await pi.exec("git", ["-C", cwd, "remote", "get-url", "origin"], { timeout: 10000 });
  return result.code === 0 ? result.stdout.trim() : "";
}

export function defaultWatchCommand(pr: string | undefined, forge: string) {
  if (forge === "github" || /github\.com[:/]/i.test(forge) || /^https:\/\/github\.com\//i.test(pr ?? "")) {
    const selector = pr ? ` ${shellQuote(pr)}` : "";
    return `gh pr view${selector} --json number,title,state,isDraft,reviewDecision,mergeStateStatus,statusCheckRollup,comments,reviews`;
  }
  if (forge === "sourcehut" || /git\.sr\.ht[:/]/i.test(forge) || /sr\.ht/i.test(forge))
    return "hut builds list --count 10";
  return undefined;
}

function watcherPrompt(goal: string, loop: string, watchCommand: string) {
  return `You are a watcher sibling agent. A parent Pi session is still active, but you are responsible for monitoring external state and responding only when useful.\n\nGoal:\n${goal}\n\nLoop:\n${loop}\n\nObserved state comes from this command:\n${watchCommand}\n\nWhen observed state changes, run the loop instructions against the latest state and take the smallest appropriate action toward the goal. If this is a pull request watcher, look for new review comments, failed checks, or requested changes. Respond via available tools/CLI only when the goal/loop explicitly allows it; otherwise summarize what changed in your log.`;
}

export interface WatcherScriptOptions {
  name: string;
  dir: string;
  logPath: string;
  stopPath: string;
  statusPath: string;
  feedbackDir: string;
  watchCommand: string;
  piCommand: string;
  intervalSeconds: number;
  maxIterations: number;
}

export function buildWatcherScript(options: WatcherScriptOptions): string {
  const {
    name,
    dir,
    logPath,
    stopPath,
    statusPath,
    feedbackDir,
    watchCommand,
    piCommand,
    intervalSeconds,
    maxIterations,
  } = options;
  return `#!/usr/bin/env bash
set -u
# Pick an available hasher: shasum is a macOS default, sha256sum the Linux
# one; cksum is POSIX. An empty hash must abort loudly, never loop silently.
if command -v sha256sum >/dev/null 2>&1; then
  hash_output() { sha256sum; }
elif command -v shasum >/dev/null 2>&1; then
  hash_output() { shasum -a 256; }
else
  hash_output() { cksum; }
fi
last_hash=""
iteration=0
reason="stopped"
printf '[watcher ${name} started]\\nlog: ${logPath}\\ncommand: %s\\n' ${shellQuote(watchCommand)} >> ${shellQuote(logPath)}
while [ ! -f ${shellQuote(stopPath)} ]; do
  iteration=$((iteration + 1))
  output="$(${watchCommand} 2>&1)"
  hash="$(printf '%s' "$output" | hash_output | awk '{print $1}')"
  if [ -z "$hash" ]; then
    reason="error: hashing output failed"
    printf '\\n[watcher ${name} error: hashing output failed; stopping]\\n' >> ${shellQuote(logPath)}
    break
  fi
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
    feedback_tmp=${shellQuote(join(feedbackDir, ".pending"))}."$iteration"."$$"
    ${piCommand} "@$observation" > "$feedback_tmp" 2>&1
    agent_status=$?
    if [ "$agent_status" -ne 0 ]; then
      printf '\\n[watcher ${name} agent exited %s]\\n' "$agent_status" >> "$feedback_tmp"
    fi
    cat "$feedback_tmp" >> ${shellQuote(logPath)}
    mv "$feedback_tmp" ${shellQuote(feedbackDir)}/"$(printf '%06d.md' "$iteration")"
  fi
  if [ ${maxIterations} -gt 0 ] && [ "$iteration" -ge ${maxIterations} ]; then
    reason="max iterations reached"
    break
  fi
  sleep ${intervalSeconds}
done
printf '%s\\n' "$reason" > ${shellQuote(statusPath)}
printf '\\n[watcher ${name} stopped: %s]\\n' "$reason" >> ${shellQuote(logPath)}
`;
}

function trackWatcher(ctx: ExtensionContext, watcher: Watcher, detail?: string) {
  watchers.set(watcher.name, watcher);
  upsertAgentTask({
    id: watcher.taskId,
    label: `watch ${watcher.name}`,
    status: "running",
    session: modelLabel(watcher.model),
    detail,
  });
  updateTaskWidget(ctx);
}

async function startWatcher(pi: ExtensionAPI, ctx: ExtensionContext, params: WatchParams) {
  const watchCommand = params.watchCommand ?? defaultWatchCommand(params.pr, await forgeHint(pi, ctx.cwd));
  if (!watchCommand) throw new Error("Could not detect a supported forge; provide watchCommand for this CI provider.");
  const goal =
    params.goal ??
    params.task ??
    (params.pr
      ? `Watch PR ${params.pr} for review comments, failed checks, and requested changes. If safe and clearly requested, respond or update the PR; otherwise log a concise summary.`
      : "Watch for changes and respond if action is needed.");
  const loop =
    params.loop ??
    (params.pr
      ? "Poll the PR state. On each change, inspect reviews, comments, reviewDecision, and statusCheckRollup. Identify only new/actionable changes since the previous observation."
      : "Poll the watched state. On each change, inspect the latest output and decide whether action is needed.");
  const name = slug(params.name ?? (params.pr ? `pr-${params.pr}` : "watch"));
  const root = await gitRoot(pi, ctx.cwd);
  const dir = join(root, CONFIG_DIR_NAME, "watchers", `${name}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  const logPath = join(dir, "watch.log");
  const stopPath = join(dir, "stop");
  const statusPath = join(dir, "status");
  const feedbackDir = join(dir, "feedback");
  const scriptPath = join(dir, "watch.sh");
  const promptPath = join(dir, "prompt.md");
  const modelSelection = selectAgentModelRef(ctx, params.model, `${goal}\n${loop}`);
  const piArgs = ["pi", "-p", "--no-session"];
  if (modelSelection.model) piArgs.push("--model", modelSelection.model);
  if (params.tools?.length) piArgs.push("--tools", params.tools.join(","));
  piArgs.push(`@${promptPath}`);

  await mkdir(feedbackDir, { recursive: true });
  await writeFile(promptPath, watcherPrompt(goal, loop, watchCommand), "utf8");
  const script = buildWatcherScript({
    name,
    dir,
    logPath,
    stopPath,
    statusPath,
    feedbackDir,
    watchCommand,
    piCommand: piArgs.map(shellQuote).join(" "),
    intervalSeconds: Math.max(15, Math.floor(params.intervalSeconds ?? 300)),
    maxIterations: Math.max(0, Math.floor(params.maxIterations ?? 0)),
  });
  await writeFile(scriptPath, script, { encoding: "utf8", mode: 0o700 });
  const result = await pi.exec(
    "bash",
    ["-lc", `cd ${shellQuote(ctx.cwd)} && nohup bash ${shellQuote(scriptPath)} >/dev/null 2>&1 & echo $!`],
    { timeout: 10000 },
  );
  const pid = Number(result.stdout.trim().split(/\s+/).pop());
  if (!Number.isFinite(pid) || pid <= 0) throw new Error(result.stderr || result.stdout || "failed to start watcher");

  const watcher: Watcher = {
    name,
    pid,
    dir,
    logPath,
    stopPath,
    statusPath,
    feedbackDir,
    taskId: `watch:${name}`,
    model: modelSelection.model,
    startedAt: Date.now(),
  };
  // Persist metadata so a restarted/reloaded session can re-adopt the
  // still-running loop instead of orphaning it.
  await writeFile(join(dir, "meta.json"), `${JSON.stringify(watcher, null, 2)}\n`, "utf8");
  trackWatcher(ctx, watcher, params.pr ? `PR ${params.pr}` : undefined);
  return { name, pid, dir, logPath, stopPath, modelSelection };
}

async function stopWatcher(pi: ExtensionAPI, ctx: ExtensionContext, name: string | undefined) {
  const targetName = name ? slug(name) : undefined;
  const targets = targetName
    ? ([watchers.get(targetName)].filter(Boolean) as Watcher[])
    : Array.from(watchers.values());
  if (!targets.length) return "No matching watchers.";
  for (const watcher of targets) {
    await writeFile(watcher.stopPath, "stop\n", "utf8").catch(() => undefined);
    // Kill children (an in-flight pi run) before the loop shell, otherwise
    // they reparent to init and keep running after the "stop".
    await pi
      .exec("bash", ["-lc", `pkill -P ${watcher.pid} >/dev/null 2>&1; kill ${watcher.pid} >/dev/null 2>&1 || true`], {
        timeout: 5000,
      })
      .catch(() => undefined);
    finishAgentTask(watcher.taskId, "done", "stopped");
    watchers.delete(watcher.name);
  }
  updateTaskWidget(ctx);
  return `Stopped ${targets.map((watcher) => watcher.name).join(", ")}.`;
}

async function readStatus(watcher: Watcher): Promise<string | undefined> {
  try {
    const status = (await readFile(watcher.statusPath, "utf8")).trim();
    return status || "stopped";
  } catch {
    return undefined;
  }
}

async function drainWatcherFeedback(pi: ExtensionAPI) {
  for (const watcher of watchers.values()) {
    let entries: string[];
    try {
      entries = (await readdir(watcher.feedbackDir)).filter((entry) => entry.endsWith(".md")).sort();
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(watcher.feedbackDir, entry);
      try {
        const content = clipTail((await readFile(path, "utf8")).trim()) || "(watcher produced no output)";
        pi.sendMessage(
          {
            customType: "watch-agent-update",
            content: `Watcher ${watcher.name} detected a change:\n\n${content}`,
            display: true,
          },
          { deliverAs: "followUp", triggerTurn: true },
        );
        await rm(path);
      } catch {
        // Keep unread feedback for the next poll.
      }
    }
  }
}

async function sweepWatchers(ctx: ExtensionContext) {
  let changed = false;
  for (const watcher of Array.from(watchers.values())) {
    const status = await readStatus(watcher);
    if (status) {
      finishAgentTask(watcher.taskId, status.startsWith("error") ? "failed" : "done", status);
      watchers.delete(watcher.name);
      changed = true;
    } else if (!isPidAlive(watcher.pid)) {
      finishAgentTask(watcher.taskId, "failed", "process died");
      watchers.delete(watcher.name);
      changed = true;
    }
  }
  if (changed) updateTaskWidget(ctx);
}

async function adoptWatchers(pi: ExtensionAPI, ctx: ExtensionContext) {
  const root = await gitRoot(pi, ctx.cwd);
  const base = join(root, CONFIG_DIR_NAME, "watchers");
  let entries: string[];
  try {
    entries = await readdir(base);
  } catch {
    return;
  }
  for (const entry of entries) {
    try {
      const meta = JSON.parse(await readFile(join(base, entry, "meta.json"), "utf8")) as Watcher;
      if (!meta?.name || !meta.pid || watchers.has(meta.name)) continue;
      meta.feedbackDir ??= join(meta.dir, "feedback");
      const finished = await readStatus(meta);
      if ((finished || !isPidAlive(meta.pid)) && !(await readdir(meta.feedbackDir).catch(() => [])).length) continue;
      trackWatcher(ctx, meta, finished ? "finishing" : "adopted");
    } catch {
      // Ignore directories without readable metadata.
    }
  }
}

async function listWatchers() {
  const rows = await Promise.all(
    Array.from(watchers.values()).map(async (watcher) => {
      const status = (await readStatus(watcher)) ?? (isPidAlive(watcher.pid) ? "running" : "not running");
      return `${watcher.name}: ${status} pid ${watcher.pid} log ${watcher.logPath}`;
    }),
  );
  return rows.length ? rows.join("\n") : "No watchers.";
}

export default function watchAgentExtension(pi: ExtensionAPI) {
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let polling = false;

  async function poll(ctx: ExtensionContext) {
    if (polling) return;
    polling = true;
    try {
      await drainWatcherFeedback(pi);
      await sweepWatchers(ctx);
    } finally {
      polling = false;
    }
  }

  pi.registerCommand("watchers", {
    description: "List active watcher sibling agents",
    handler: async (_args, ctx) => ctx.ui.notify(await listWatchers(), "info"),
  });

  pi.registerCommand("watcher-stop", {
    description: "Stop watcher sibling agents: /watcher-stop [name]",
    handler: async (args, ctx) => ctx.ui.notify(await stopWatcher(pi, ctx, args.trim() || undefined), "info"),
  });

  pi.on("session_start", async (_event, ctx) => {
    if (pollTimer) clearInterval(pollTimer);
    await adoptWatchers(pi, ctx);
    await poll(ctx);
    pollTimer = setInterval(() => void poll(ctx).catch(() => undefined), 1000);
    pollTimer.unref();
  });

  pi.on("turn_end", async (_event, ctx) => poll(ctx));

  pi.on("session_shutdown", async () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = undefined;
  });

  pi.registerTool({
    name: "watch_agent",
    label: "Watch Agent",
    description: "Start, stop, or list a sibling watcher agent that polls external state and runs pi when it changes.",
    promptSnippet: "Start a sibling watcher agent for PR reviews, checks, or external task changes",
    promptGuidelines: [
      "Use watch_agent when the user asks to watch a PR, review comments, checks, or another external process while the parent Pi session stays active.",
      "After opening or updating a PR, start watch_agent immediately without asking so the parent receives review and CI updates.",
    ],
    parameters: WATCH_AGENT_PARAMS,
    async execute(_id, params, _signal, _update, ctx) {
      const action = params.action ?? "start";
      if (action === "list")
        return {
          content: [{ type: "text", text: await listWatchers() }],
          details: { watchers: Array.from(watchers.values()) },
        };
      if (action === "stop")
        return {
          content: [{ type: "text", text: await stopWatcher(pi, ctx, params.name) }],
          details: { watchers: Array.from(watchers.values()) },
        };
      const watcher = await startWatcher(pi, ctx, params);
      return {
        content: [
          { type: "text", text: `Watcher started: ${watcher.name}\nPID: ${watcher.pid}\nLog: ${watcher.logPath}` },
        ],
        details: watcher,
      };
    },
  });
}
