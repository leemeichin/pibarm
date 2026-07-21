import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { effectiveProjectContext, filterSystemPromptContext } from "../lib/prompt-context.js";

export default function promptContext(pi: ExtensionAPI) {
  const roots = new Map<string, string | undefined>();

  pi.on("before_agent_start", async (event, ctx) => {
    const files = event.systemPromptOptions.contextFiles ?? [];
    if (files.length < 2) return;

    if (!roots.has(ctx.cwd)) {
      const result = await pi.exec("git", ["-C", ctx.cwd, "rev-parse", "--show-toplevel"], { timeout: 10000 });
      roots.set(ctx.cwd, result.code === 0 ? result.stdout.trim() : undefined);
    }
    const effective = effectiveProjectContext(files, roots.get(ctx.cwd));
    if (effective.length === files.length) return;
    return { systemPrompt: filterSystemPromptContext(event.systemPrompt, files, effective) };
  });
}
