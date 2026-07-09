import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

interface Preset {
  provider?: string;
  model?: string;
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  tools?: string[];
}

interface PresetFile {
  presets: Record<string, Preset>;
}

const SUBAGENT_PARAMS = Type.Object({
  prompt: Type.String({ description: "Self-contained prompt for the subagent" }),
  model: Type.Optional(Type.String({ description: "Optional pi model pattern, e.g. anthropic/claude-haiku-4-5" })),
  timeoutMs: Type.Optional(Type.Number({ description: "Timeout in milliseconds" })),
});

const SUBAGENTS_PARAMS = Type.Object({
  jobs: Type.Array(Type.Object({
    name: Type.Optional(Type.String({ description: "Short label for this subagent" })),
    prompt: Type.String({ description: "Self-contained prompt for this subagent" }),
    model: Type.Optional(Type.String({ description: "Optional pi model pattern for this subagent" })),
    timeoutMs: Type.Optional(Type.Number({ description: "Timeout in milliseconds for this subagent" })),
  }), { description: "Subagent jobs to run in parallel" }),
  timeoutMs: Type.Optional(Type.Number({ description: "Default timeout per subagent in milliseconds" })),
});

async function loadPresets(cwd: string): Promise<PresetFile> {
  const raw = await readFile(join(cwd, ".pi", "agent-presets.json"), "utf8");
  return JSON.parse(raw) as PresetFile;
}

function splitModel(provider: string | undefined, model: string | undefined): { provider?: string; id?: string } {
  if (!model) return { provider, id: undefined };
  if (provider) return { provider, id: model };
  const slash = model.indexOf("/");
  if (slash > 0) return { provider: model.slice(0, slash), id: model.slice(slash + 1) };
  return { provider, id: model };
}

async function runPiPrompt(pi: ExtensionAPI, prompt: string, model: string | undefined, signal: AbortSignal | undefined, timeoutMs: number) {
  const args = ["-p"];
  if (model) args.push("--model", model);
  args.push(prompt);
  return pi.exec("pi", args, { signal, timeout: timeoutMs });
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
  pi.registerCommand("preset", {
    description: "Apply a named preset from .pi/agent-presets.json, or list presets with no args",
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
    description: "Run a non-interactive pi subagent with an isolated prompt and return stdout/stderr.",
    promptSnippet: "Run an isolated pi -p subagent for research, planning, or verification",
    promptGuidelines: ["Use run_subagent only for isolated research, planning, or verification tasks with a self-contained prompt."],
    parameters: SUBAGENT_PARAMS,
    async execute(_toolCallId, params, signal) {
      const result = await runPiPrompt(pi, params.prompt, params.model, signal, params.timeoutMs ?? 120000);
      const text = [result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n\n--- stderr ---\n");
      return {
        content: [{ type: "text", text: text || `(pi exited ${result.code})` }],
        details: result,
        isError: result.code !== 0,
      };
    },
  });

  pi.registerTool({
    name: "run_subagents",
    label: "Run Subagents",
    description: "Run several non-interactive pi subagents in parallel, optionally on different models.",
    promptSnippet: "Run multiple isolated pi -p subagents in parallel, optionally across models",
    promptGuidelines: ["Use run_subagents when the user asks to compare, delegate, or orchestrate multiple subagents across models."],
    parameters: SUBAGENTS_PARAMS,
    async execute(_toolCallId, params, signal) {
      if (params.jobs.length === 0) {
        return { content: [{ type: "text", text: "No subagent jobs provided." }], details: undefined, isError: true };
      }
      if (params.jobs.length > 4) {
        return { content: [{ type: "text", text: "Refusing to run more than 4 subagents at once." }], details: undefined, isError: true };
      }

      const results = await Promise.all(params.jobs.map(async (job, index) => {
        const result = await runPiPrompt(pi, job.prompt, job.model, signal, job.timeoutMs ?? params.timeoutMs ?? 120000);
        return { name: job.name ?? `job-${index + 1}`, model: job.model, result };
      }));
      const text = results.map(({ name, model, result }) => {
        const output = [result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n\n--- stderr ---\n");
        return `## ${name}${model ? ` (${model})` : ""}\n${output || `(pi exited ${result.code})`}`;
      }).join("\n\n---\n\n");
      return {
        content: [{ type: "text", text }],
        details: { results },
        isError: results.some(({ result }) => result.code !== 0),
      };
    },
  });
}
