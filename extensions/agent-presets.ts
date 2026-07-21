import { CONFIG_DIR_NAME, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { registerChildAgentRunner } from "../lib/agent-runner.js";
import { selectAgentModelRef } from "../lib/current-model.js";
import { finishAgentTask, upsertAgentTask, updateTaskWidget } from "../lib/task-widget.js";
import { clipTail } from "../lib/tool-output.js";

interface Preset {
  provider?: string;
  model?: string;
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  tools?: string[];
}

interface PresetFile {
  presets: Record<string, Preset>;
}

const DEFAULT_SUBAGENT_TIMEOUT_MS = 600000;

function agentExitDetail(code: number | null | undefined, timeoutMs: number) {
  if (code === 143) return `exit 143 (SIGTERM; likely timeout/cancel after ${Math.round(timeoutMs / 1000)}s)`;
  return `exit ${code}`;
}

const SUBAGENT_PARAMS = Type.Object({
  prompt: Type.String({ description: "Self-contained prompt for the subagent" }),
  model: Type.Optional(
    Type.String({
      description:
        "Optional pi model pattern. Defaults to the current active model, with a lighter available model for simple tasks.",
    }),
  ),
  timeoutMs: Type.Optional(Type.Number({ description: "Timeout in milliseconds" })),
});

const SUBAGENTS_PARAMS = Type.Object({
  jobs: Type.Array(
    Type.Object({
      name: Type.Optional(Type.String({ description: "Short label for this subagent" })),
      prompt: Type.String({ description: "Self-contained prompt for this subagent" }),
      model: Type.Optional(
        Type.String({
          description:
            "Optional pi model pattern for this subagent. Defaults to the current active model, with a lighter available model for simple tasks.",
        }),
      ),
      timeoutMs: Type.Optional(Type.Number({ description: "Timeout in milliseconds for this subagent" })),
    }),
    { description: "Subagent jobs to run in parallel" },
  ),
  timeoutMs: Type.Optional(Type.Number({ description: "Default timeout per subagent in milliseconds" })),
});

async function loadPresets(cwd: string): Promise<PresetFile> {
  const raw = await readFile(join(cwd, CONFIG_DIR_NAME, "agent-presets.json"), "utf8");
  return JSON.parse(raw) as PresetFile;
}

function splitModel(provider: string | undefined, model: string | undefined): { provider?: string; id?: string } {
  if (!model) return { provider, id: undefined };
  if (provider) return { provider, id: model };
  const slash = model.indexOf("/");
  if (slash > 0) return { provider: model.slice(0, slash), id: model.slice(slash + 1) };
  return { provider, id: model };
}

function modelLabel(model: string | undefined) {
  return (
    model
      ?.split("/")
      .pop()
      ?.replace(/^claude-/, "") ?? "default"
  );
}

export function detectPrRefs(text: string): string[] {
  const refs = new Set<string>();
  for (const match of text.matchAll(/https:\/\/github\.com\/[^\s)]+\/[^\s)]+\/pull\/(\d+)/g)) refs.add(match[0]);
  // Only bare numbers preceded by an "opened/created" phrase count — a mere
  // mention like "fixed in PR #42" should not suggest a watcher.
  for (const match of text.matchAll(
    /\b(?:opened|created|submitted|raised)\s+(?:a\s+|new\s+)?(?:pull request|PR)\s*#?(\d+)\b/gi,
  ))
    refs.add(match[1]!);
  return [...refs];
}

export async function offerPrWatcher(
  pi: Pick<ExtensionAPI, "sendUserMessage">,
  ctx: any,
  output: string,
  source: string,
) {
  // A headless parent exits before watcher feedback can return; interactive
  // sessions start the watcher automatically so opened PRs are not orphaned.
  if (!ctx.hasUI) return;
  const refs = detectPrRefs(output);
  if (!refs.length) return;
  const pr = refs[0];
  pi.sendUserMessage(
    `Subagent ${source} opened PR ${pr}. Start watch_agent immediately for review comments, failed checks, requested changes, and actionable CI updates while this parent session remains active.`,
    { deliverAs: "followUp" },
  );
}

async function applyPreset(pi: ExtensionAPI, ctx: any, name: string): Promise<boolean> {
  const file = await loadPresets(ctx.cwd);
  const preset = file.presets[name];
  if (!preset) {
    ctx.ui.notify(`Unknown preset: ${name}. Available: ${Object.keys(file.presets).join(", ")}`, "warning");
    return false;
  }

  const { provider, id } = splitModel(preset.provider, preset.model);
  if (provider && id) {
    const model = ctx.modelRegistry.find(provider, id);
    if (!model) {
      ctx.ui.notify(`Preset ${name}: model not found: ${provider}/${id}`, "warning");
    } else if (!(await pi.setModel(model))) {
      ctx.ui.notify(`Preset ${name}: model has no available API key: ${provider}/${id}`, "error");
    }
  }

  if (preset.thinkingLevel) pi.setThinkingLevel(preset.thinkingLevel);
  if (preset.tools) pi.setActiveTools(preset.tools);
  ctx.ui.notify(`Applied preset: ${name}`, "info");
  return true;
}

export default function agentPresets(pi: ExtensionAPI) {
  const runner = registerChildAgentRunner(pi);

  pi.registerCommand("preset", {
    description: `Apply a named preset from ${CONFIG_DIR_NAME}/agent-presets.json, or list presets with no args`,
    handler: async (args, ctx) => {
      const name = args.trim();
      try {
        if (!name) {
          const file = await loadPresets(ctx.cwd);
          ctx.ui.notify(`Presets: ${Object.keys(file.presets).join(", ")}`, "info");
          return;
        }
        await applyPreset(pi, ctx, name);
      } catch (error) {
        ctx.ui.notify(`Preset error: ${(error as Error).message}`, "error");
      }
    },
  });

  pi.registerTool({
    name: "run_subagent",
    label: "Run Subagent",
    description:
      "Run an isolated pi subagent and return bounded output. Uses managed tmux panes automatically when configured and available, with headless fallback.",
    parameters: SUBAGENT_PARAMS,
    async execute(_toolCallId, params, signal, _update, ctx) {
      const modelSelection = selectAgentModelRef(ctx, params.model, params.prompt);
      const taskId = `subagent:${_toolCallId}`;
      upsertAgentTask({ id: taskId, label: "subagent", status: "running", session: modelLabel(modelSelection.model) });
      updateTaskWidget(ctx);
      const timeoutMs = params.timeoutMs ?? DEFAULT_SUBAGENT_TIMEOUT_MS;
      const result = await runner.run(
        {
          id: taskId,
          prompt: params.prompt,
          kind: "subagent",
          cwd: ctx.cwd,
          model: modelSelection.model,
          timeoutMs,
          signal,
        },
        ctx,
      );
      const failed = result.code !== 0;
      finishAgentTask(taskId, failed ? "failed" : "done", failed ? agentExitDetail(result.code, timeoutMs) : undefined);
      updateTaskWidget(ctx);
      const output = [result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n\n--- stderr ---\n");
      const text = [output, result.attachCommand && `tmux: ${result.attachCommand}`].filter(Boolean).join("\n\n");
      if (failed) {
        // Throwing is the only way to flag failure; a returned isError is ignored.
        throw new Error(
          `Subagent failed (${agentExitDetail(result.code, timeoutMs)}).${text ? `\n\n${clipTail(text)}` : ""}`,
        );
      }
      await offerPrWatcher(pi, ctx, text, "run_subagent");
      return {
        content: [{ type: "text", text: clipTail(text) || "(subagent produced no output)" }],
        details: { modelSelection, result },
      };
    },
  });

  pi.registerTool({
    name: "run_subagents",
    label: "Run Subagents",
    description:
      "Run several isolated pi subagents in parallel, optionally on different models. Uses the configured tmux/headless renderer and returns bounded output per job.",
    parameters: SUBAGENTS_PARAMS,
    async execute(_toolCallId, params, signal, _update, ctx) {
      if (params.jobs.length === 0) throw new Error("No subagent jobs provided.");
      if (params.jobs.length > 4) throw new Error("Refusing to run more than 4 subagents at once.");

      const results = await Promise.all(
        params.jobs.map(async (job, index) => {
          const name = job.name ?? `job-${index + 1}`;
          const modelSelection = selectAgentModelRef(ctx, job.model, job.prompt);
          const taskId = `subagent:${_toolCallId}:${index}`;
          upsertAgentTask({
            id: taskId,
            label: `sub ${name}`,
            status: "running",
            session: modelLabel(modelSelection.model),
          });
          updateTaskWidget(ctx);
          const timeoutMs = job.timeoutMs ?? params.timeoutMs ?? DEFAULT_SUBAGENT_TIMEOUT_MS;
          const result = await runner.run(
            {
              id: taskId,
              prompt: job.prompt,
              kind: "subagent",
              cwd: ctx.cwd,
              model: modelSelection.model,
              timeoutMs,
              signal,
            },
            ctx,
          );
          finishAgentTask(
            taskId,
            result.code === 0 ? "done" : "failed",
            result.code === 0 ? undefined : agentExitDetail(result.code, timeoutMs),
          );
          updateTaskWidget(ctx);
          return { name, model: modelSelection.model, modelSelection, result, timeoutMs };
        }),
      );
      const text = results
        .map(({ name, model, result }) => {
          const output = [result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n\n--- stderr ---\n");
          const rendered = [
            clipTail(output) || `(pi exited ${result.code})`,
            result.attachCommand && `tmux: ${result.attachCommand}`,
          ]
            .filter(Boolean)
            .join("\n\n");
          return `## ${name}${model ? ` (${model})` : ""}\n${rendered}`;
        })
        .join("\n\n---\n\n");
      const failures = results.filter(({ result }) => result.code !== 0);
      if (failures.length) {
        const detail = failures
          .map(({ name, result, timeoutMs }) => `${name}: ${agentExitDetail(result.code, timeoutMs)}`)
          .join(", ");
        throw new Error(`${failures.length} of ${results.length} subagent job(s) failed (${detail}).\n\n${text}`);
      }
      await offerPrWatcher(pi, ctx, text, "run_subagents");
      return {
        content: [{ type: "text", text }],
        details: { results },
      };
    },
  });
}
