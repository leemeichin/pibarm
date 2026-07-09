import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

interface McporterConfig {
  command?: string;
  callArgs?: string[];
  listArgs?: string[];
  resourceArgs?: string[];
  env?: Record<string, string>;
  timeoutMs?: number;
}

const DEFAULT_CONFIG: Required<McporterConfig> = {
  command: "mcporter",
  callArgs: ["call", "{selector}", "--args", "{argumentsJson}", "--output", "json"],
  listArgs: ["list", "{server}", "{schemaFlag}", "--json"],
  resourceArgs: ["resource", "{server}", "{uri}"],
  env: {},
  timeoutMs: 120000,
};

const CALL_PARAMS = Type.Object({
  server: Type.String({ description: "MCP server name as known to mcporter" }),
  tool: Type.String({ description: "MCP tool name to call through mcporter" }),
  arguments: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: "Tool arguments" })),
});

const LIST_PARAMS = Type.Object({
  server: Type.Optional(Type.String({ description: "Optional MCP server name to inspect" })),
  schema: Type.Optional(Type.Boolean({ description: "Include tool schemas/docs" })),
});

const RESOURCE_PARAMS = Type.Object({
  server: Type.String({ description: "MCP server name as known to mcporter" }),
  uri: Type.Optional(Type.String({ description: "Optional resource URI to read. Omit to list resources." })),
});

async function loadConfig(cwd: string): Promise<Required<McporterConfig>> {
  try {
    const raw = await readFile(join(cwd, ".pi", "mcporter.json"), "utf8");
    const parsed = JSON.parse(raw) as McporterConfig & { args?: string[] };
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      callArgs: parsed.callArgs ?? parsed.args ?? DEFAULT_CONFIG.callArgs,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function expandEnv(value: string): string {
  return value.replace(/\$\{?([A-Z0-9_]+)\}?/gi, (_match, name) => process.env[name] ?? "");
}

function expandArg(template: string, values: Record<string, string>): string {
  return template.replace(/\{(server|tool|selector|argumentsJson|schemaFlag|uri)\}/g, (_match, key) => values[key]);
}

function compactArgs(args: string[]): string[] {
  return args.filter((arg) => arg.length > 0);
}

async function runMcporter(
  pi: ExtensionAPI,
  cwd: string,
  args: string[],
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<{ command: string; args: string[]; stdout: string; stderr: string; code: number | null }> {
  const config = await loadConfig(cwd);
  const env = { ...process.env } as Record<string, string>;
  for (const [key, value] of Object.entries(config.env)) env[key] = expandEnv(value);

  const hasCustomEnv = Object.keys(config.env).length > 0;
  const command = hasCustomEnv ? "env" : config.command;
  const commandArgs = hasCustomEnv
    ? [...Object.entries(config.env).map(([key]) => `${key}=${env[key]}`), config.command, ...args]
    : args;
  const result = await pi.exec(command, commandArgs, { signal: options.signal, timeout: options.timeoutMs ?? config.timeoutMs });
  return {
    command,
    args: commandArgs,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    code: result.code,
  };
}

function resultText(result: { stdout: string; stderr: string; code: number | null }): string {
  return result.stdout || result.stderr || `(mcporter exited ${result.code})`;
}

export default function mcporterExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "mcporter_list",
    label: "Mcporter List",
    description: "List configured MCP servers through mcporter, optionally including tool schemas.",
    promptSnippet: "Discover configured MCP servers and tool schemas through mcporter",
    promptGuidelines: ["Use mcporter_list before mcporter_call when you need to discover available MCP servers, tools, or schemas."],
    parameters: LIST_PARAMS,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const config = await loadConfig(ctx.cwd);
      const args = compactArgs(config.listArgs.map((arg) => expandArg(arg, {
        server: params.server ?? "",
        tool: "",
        selector: "",
        argumentsJson: "{}",
        schemaFlag: params.schema ? "--schema" : "",
        uri: "",
      })));
      const result = await runMcporter(pi, ctx.cwd, args, { signal });
      return {
        content: [{ type: "text", text: resultText(result) }],
        details: result,
        isError: result.code !== 0,
      };
    },
  });

  pi.registerTool({
    name: "mcporter_call",
    label: "Mcporter Call",
    description: "Call an MCP server tool through the mcporter CLI wrapper.",
    promptSnippet: "Call MCP tools through mcporter by server and tool name",
    promptGuidelines: ["Use mcporter_call when the user asks to use an MCP server or a tool exposed through mcporter."],
    parameters: CALL_PARAMS,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const config = await loadConfig(ctx.cwd);
      const argumentsJson = JSON.stringify(params.arguments ?? {});
      const selector = `${params.server}.${params.tool}`;
      const args = compactArgs(config.callArgs.map((arg) => expandArg(arg, {
        server: params.server,
        tool: params.tool,
        selector,
        argumentsJson,
        schemaFlag: "",
        uri: "",
      })));
      const result = await runMcporter(pi, ctx.cwd, args, { signal });
      return {
        content: [{ type: "text", text: resultText(result) }],
        details: result,
        isError: result.code !== 0,
      };
    },
  });

  pi.registerTool({
    name: "mcporter_resource",
    label: "Mcporter Resource",
    description: "List or read MCP resources through mcporter.",
    promptSnippet: "List or read MCP resources exposed by a configured server through mcporter",
    promptGuidelines: ["Use mcporter_resource when the user asks to inspect resources exposed by an MCP server."],
    parameters: RESOURCE_PARAMS,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const config = await loadConfig(ctx.cwd);
      const args = compactArgs(config.resourceArgs.map((arg) => expandArg(arg, {
        server: params.server,
        tool: "",
        selector: "",
        argumentsJson: "{}",
        schemaFlag: "",
        uri: params.uri ?? "",
      })));
      const result = await runMcporter(pi, ctx.cwd, args, { signal });
      return {
        content: [{ type: "text", text: resultText(result) }],
        details: result,
        isError: result.code !== 0,
      };
    },
  });

  pi.registerCommand("mcporter", {
    description: "Show or run mcporter. Usage: /mcporter [raw args...]",
    handler: async (args, ctx) => {
      const config = await loadConfig(ctx.cwd);
      if (!args.trim()) {
        ctx.ui.notify(`mcporter command: ${config.command}\ncall: ${config.callArgs.join(" ")}\nlist: ${config.listArgs.join(" ")}`, "info");
        return;
      }
      const result = await runMcporter(pi, ctx.cwd, args.trim().split(/\s+/));
      ctx.ui.notify(resultText(result), result.code === 0 ? "info" : "error");
    },
  });
}
