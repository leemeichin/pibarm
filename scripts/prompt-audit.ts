#!/usr/bin/env bun
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";
import { effectiveProjectContext } from "../lib/prompt-context.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionPaths = (await readdir(join(root, "extensions")))
  .filter((name) => name.endsWith(".ts"))
  .map((name) => join(root, "extensions", name));
const loader = new DefaultResourceLoader({
  cwd: root,
  agentDir: join(root, ".pi", "audit-agent"),
  settingsManager: SettingsManager.inMemory({}),
  additionalExtensionPaths: extensionPaths,
  additionalSkillPaths: [join(root, "skills")],
  additionalPromptTemplatePaths: [join(root, "prompts")],
  noThemes: true,
});
await loader.reload();
const extensionErrors = loader.getExtensions().errors;
if (extensionErrors.length) throw new Error(extensionErrors.map((error) => error.error).join("\n"));

const definitions = new Map<string, any>();
for (const extension of loader.getExtensions().extensions) {
  for (const [name, tool] of extension.tools) if (!definitions.has(name)) definitions.set(name, tool.definition);
}

let active = [...definitions.keys()];
try {
  const policy = await import("../lib/tool-policy.ts");
  active = policy.initialPibarmTools(active);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ERR_MODULE_NOT_FOUND") throw error;
}

const piDist = dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")));
const { buildSystemPrompt } = await import(join(piDist, "core", "system-prompt.js"));
const contextFiles = loader.getAgentsFiles().agentsFiles;
const effectiveContextFiles = effectiveProjectContext(contextFiles, root);
const uniqueContextFiles = [...new Map(contextFiles.map((file) => [file.content, file])).values()];
const skills = loader.getSkills().skills;
const activeDefinitions = active.map((name) => definitions.get(name)).filter(Boolean);
const prompt = buildSystemPrompt({
  customPrompt: loader.getSystemPrompt(),
  selectedTools: ["read", "bash", "edit", "write", ...active],
  toolSnippets: Object.fromEntries(
    activeDefinitions.filter((tool) => tool.promptSnippet).map((tool) => [tool.name, tool.promptSnippet]),
  ),
  promptGuidelines: activeDefinitions.flatMap((tool) => tool.promptGuidelines ?? []),
  appendSystemPrompt: loader.getAppendSystemPrompt().join("\n\n"),
  cwd: "<project>",
  contextFiles: effectiveContextFiles.map((file) => ({
    path: file.path.split("/").pop() ?? "AGENTS.md",
    content: file.content,
  })),
  skills,
});
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const schemaChars = activeDefinitions.reduce((sum, tool) => sum + JSON.stringify(tool.parameters).length, 0);
const metadataChars = activeDefinitions.reduce(
  (sum, tool) => sum + (tool.promptSnippet?.length ?? 0) + (tool.promptGuidelines ?? []).join("\n").length,
  0,
);

console.log(
  JSON.stringify(
    {
      piVersion: pkg.devDependencies["@earendil-works/pi-coding-agent"],
      prompt: {
        chars: prompt.length,
        lines: prompt.split("\n").length,
        approximateTokens: Math.ceil(prompt.length / 4),
      },
      context: {
        files: contextFiles.length,
        effectiveFiles: effectiveContextFiles.length,
        uniqueFiles: uniqueContextFiles.length,
        chars: contextFiles.reduce((sum, file) => sum + file.content.length, 0),
        effectiveChars: effectiveContextFiles.reduce((sum, file) => sum + file.content.length, 0),
        excludedChars:
          contextFiles.reduce((sum, file) => sum + file.content.length, 0) -
          effectiveContextFiles.reduce((sum, file) => sum + file.content.length, 0),
        duplicateChars:
          contextFiles.reduce((sum, file) => sum + file.content.length, 0) -
          uniqueContextFiles.reduce((sum, file) => sum + file.content.length, 0),
        appendedChars: loader.getAppendSystemPrompt().join("\n\n").length,
      },
      tools: { registered: definitions.size, active: active.length, schemaChars, metadataChars },
      skills: {
        count: skills.length,
        catalogChars: skills.reduce((sum, skill) => sum + skill.name.length + skill.description.length, 0),
      },
      extensionErrors: extensionErrors.length,
    },
    null,
    2,
  ),
);
