import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const LIMIT_PARAMS = Type.Object({
  limit: Type.Optional(Type.Number({ description: "Maximum rows to return when supported. Defaults to 10." })),
});

async function runHut(pi: ExtensionAPI, args: string[], signal?: AbortSignal) {
  const result = await pi.exec("hut", args, { signal, timeout: 30000 });
  const stdout = result.stdout?.trim() ?? "";
  const stderr = result.stderr?.trim() ?? "";
  return { args, stdout, stderr, code: result.code };
}

function text(result: { stdout: string; stderr: string; code: number | null }) {
  return result.stdout || result.stderr || `(hut exited ${result.code})`;
}

export default function sourcehutExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "sourcehut_builds",
    label: "SourceHut Builds",
    description: "List SourceHut builds using hut.",
    promptSnippet: "Inspect SourceHut builds with hut",
    promptGuidelines: ["Use sourcehut_builds when the user asks about SourceHut CI/builds."],
    parameters: LIMIT_PARAMS,
    async execute(_id, params, signal) {
      const result = await runHut(pi, ["builds", "list", "--count", String(params.limit ?? 10)], signal);
      return { content: [{ type: "text", text: text(result) }], details: result, isError: result.code !== 0 };
    },
  });

  pi.registerTool({
    name: "sourcehut_tickets",
    label: "SourceHut Tickets",
    description: "List SourceHut tickets using hut.",
    promptSnippet: "Inspect SourceHut tickets with hut",
    promptGuidelines: ["Use sourcehut_tickets when the user asks about SourceHut tickets/issues."],
    parameters: LIMIT_PARAMS,
    async execute(_id, params, signal) {
      const result = await runHut(pi, ["todo", "ticket", "list", "--count", String(params.limit ?? 10)], signal);
      return { content: [{ type: "text", text: text(result) }], details: result, isError: result.code !== 0 };
    },
  });

  pi.registerCommand("srht-builds", {
    description: "List recent SourceHut builds with hut",
    handler: async (_args, ctx) => {
      const result = await runHut(pi, ["builds", "list", "--count", "10"]);
      ctx.ui.notify(text(result), result.code === 0 ? "info" : "error");
    },
  });

  pi.registerCommand("hut", {
    description: "Run raw hut args. Usage: /hut <args...>",
    handler: async (args, ctx) => {
      if (!args.trim()) {
        ctx.ui.notify("Usage: /hut <args...>", "warning");
        return;
      }
      const result = await runHut(pi, args.trim().split(/\s+/));
      ctx.ui.notify(text(result), result.code === 0 ? "info" : "error");
    },
  });
}
