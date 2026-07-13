import { CONFIG_DIR_NAME, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

interface McporterContext {
  cwd: string;
  isProjectTrusted(): boolean;
}

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

async function loadConfig(ctx: McporterContext): Promise<Required<McporterConfig>> {
  // Project-local config chooses the executed binary and its environment, so it
  // must never be honored for untrusted projects.
  if (!ctx.isProjectTrusted()) return DEFAULT_CONFIG;
  try {
    const raw = await readFile(join(ctx.cwd, CONFIG_DIR_NAME, "mcporter.json"), "utf8");
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

export function tokenizeArgs(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let hasToken = false;
  for (const char of input) {
    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      hasToken = true;
    } else if (/\s/.test(char)) {
      if (hasToken || current) {
        tokens.push(current);
        current = "";
        hasToken = false;
      }
    } else {
      current += char;
    }
  }
  if (hasToken || current) tokens.push(current);
  return tokens;
}

async function runMcporter(
  pi: ExtensionAPI,
  ctx: McporterContext,
  args: string[],
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<{ command: string; args: string[]; stdout: string; stderr: string; code: number | null }> {
  const config = await loadConfig(ctx);
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
      const config = await loadConfig(ctx);
      const args = compactArgs(config.listArgs.map((arg) => expandArg(arg, {
        server: params.server ?? "",
        tool: "",
        selector: "",
        argumentsJson: "{}",
        schemaFlag: params.schema ? "--schema" : "",
        uri: "",
      })));
      const result = await runMcporter(pi, ctx, args, { signal });
      if (result.code !== 0) {
        // Throw so failures are flagged to the model; a returned isError is ignored.
        throw new Error(result.stderr || result.stdout || `mcporter exited ${result.code}`);
      }
      return {
        content: [{ type: "text", text: resultText(result) }],
        details: result,
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
      const config = await loadConfig(ctx);
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
      const result = await runMcporter(pi, ctx, args, { signal });
      if (result.code !== 0) {
        // Throw so failures are flagged to the model; a returned isError is ignored.
        throw new Error(result.stderr || result.stdout || `mcporter exited ${result.code}`);
      }
      return {
        content: [{ type: "text", text: resultText(result) }],
        details: result,
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
      const config = await loadConfig(ctx);
      const args = compactArgs(config.resourceArgs.map((arg) => expandArg(arg, {
        server: params.server,
        tool: "",
        selector: "",
        argumentsJson: "{}",
        schemaFlag: "",
        uri: params.uri ?? "",
      })));
      const result = await runMcporter(pi, ctx, args, { signal });
      if (result.code !== 0) {
        // Throw so failures are flagged to the model; a returned isError is ignored.
        throw new Error(result.stderr || result.stdout || `mcporter exited ${result.code}`);
      }
      return {
        content: [{ type: "text", text: resultText(result) }],
        details: result,
      };
    },
  });

  pi.registerCommand("mcporter", {
    description: "Show or run mcporter. Usage: /mcporter [raw args...]",
    handler: async (args, ctx) => {
      const config = await loadConfig(ctx);
      if (!args.trim()) {
        ctx.ui.notify(`mcporter command: ${config.command}\ncall: ${config.callArgs.join(" ")}\nlist: ${config.listArgs.join(" ")}`, "info");
        return;
      }
      const result = await runMcporter(pi, ctx, tokenizeArgs(args));
      ctx.ui.notify(resultText(result), result.code === 0 ? "info" : "error");
    },
  });
}
