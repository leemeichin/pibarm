import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { delimiter, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { getPibarmSettings } from "../lib/pibarm-settings.js";

const SERENA_VERSION = "1.6.1";
const SERENA_PACKAGE =
  "https://files.pythonhosted.org/packages/43/35/fe30599bcf4760519706c1aa635a25c4a656f26001d445e270b80bca4905/serena_agent-1.6.1-py3-none-any.whl#sha256=04ddd985bd3feb25598ab8732bf3a998f961d5b46dce271b816126c0a68a91e1";
const UV_VERSION = "0.11.30";
const MAX_OUTPUT = 20_000;

const PARAMS = Type.Object({
  operation: Type.Union(
    ["definition", "references", "hover", "symbols", "diagnostics"].map((value) => Type.Literal(value)),
    { description: "Semantic code-intelligence operation" },
  ),
  path: Type.String({ description: "Project-relative source file" }),
  line: Type.Optional(Type.Integer({ minimum: 1, description: "One-based line containing the symbol" })),
  column: Type.Optional(Type.Integer({ minimum: 1, description: "One-based column containing the symbol" })),
  query: Type.Optional(
    Type.String({ description: "Symbol name or name path; inferred from line/column when omitted" }),
  ),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, description: "Maximum matches. Defaults to 50" })),
});

type Operation = "definition" | "references" | "hover" | "symbols" | "diagnostics";
type Runner = { command: string; prefix: string[] };

function offline() {
  return /^(1|true|yes)$/i.test(process.env.PI_OFFLINE ?? "");
}

export function symbolAtPosition(source: string, line: number, column: number): string | undefined {
  const text = source.split(/\r?\n/)[line - 1];
  if (text === undefined) return;
  let index = Math.min(column - 1, Math.max(0, text.length - 1));
  const symbol = /[A-Za-z0-9_$!?]/;
  if (!symbol.test(text[index] ?? "") && index > 0 && symbol.test(text[index - 1] ?? "")) index--;
  let start = index;
  let end = index;
  while (start > 0 && symbol.test(text[start - 1])) start--;
  while (end < text.length && symbol.test(text[end])) end++;
  return text.slice(start, end) || undefined;
}

export function serenaCall(
  operation: Operation,
  path: string,
  query: string | undefined,
  limit = 50,
): { tool: string; arguments: Record<string, unknown> } {
  if (operation === "diagnostics") {
    return {
      tool: "get_diagnostics_for_file",
      arguments: { relative_path: path, min_severity: 4, max_answer_chars: MAX_OUTPUT },
    };
  }
  if (operation === "symbols" && !query) {
    return {
      tool: "get_symbols_overview",
      arguments: { relative_path: path, depth: 0, max_answer_chars: MAX_OUTPUT },
    };
  }
  if (!query) throw new Error(`${operation} requires query or line and column`);
  if (operation === "references") {
    return {
      tool: "find_referencing_symbols",
      arguments: { name_path: query, relative_path: path, max_answer_chars: MAX_OUTPUT },
    };
  }
  return {
    tool: "find_symbol",
    arguments: {
      name_path_pattern: query,
      relative_path: path,
      include_body: false,
      include_info: operation === "hover",
      max_matches: limit,
      max_answer_chars: MAX_OUTPUT,
    },
  };
}

export async function confinedFile(root: string, input: string) {
  const rootPath = await realpath(root);
  const filePath = await realpath(resolve(rootPath, input));
  const rel = relative(rootPath, filePath);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("path must be a file inside the project");
  return { filePath, relativePath: rel.split(sep).join("/") };
}

async function commandWorks(pi: ExtensionAPI, runner: Runner, cwd: string, timeout = 10_000) {
  const result = await pi.exec(runner.command, [...runner.prefix, "--version"], { cwd, timeout });
  return result.code === 0;
}

async function cachedUvRunner(cache: string): Promise<Runner | undefined> {
  const installRoot = resolve(cache, "mise", "data", "installs", "uv", UV_VERSION);
  try {
    const executable = (await readdir(installRoot, { recursive: true })).find((path) =>
      /(^|\/)uvx(?:\.exe)?$/.test(path),
    );
    return executable ? { command: resolve(installRoot, executable), prefix: [] } : undefined;
  } catch {
    return;
  }
}

async function findRunner(
  pi: ExtensionAPI,
  cwd: string,
  cache: string,
  allowInstall: boolean,
): Promise<Runner | undefined> {
  const uvx = { command: "uvx", prefix: [] };
  if (await commandWorks(pi, uvx, cwd)) return uvx;
  if (await commandWorks(pi, { command: "uv", prefix: [] }, cwd)) return { command: "uv", prefix: ["tool", "run"] };
  const cached = await cachedUvRunner(cache);
  if (cached || !allowInstall) return cached;
  const miseRoot = resolve(cache, "mise");
  const mise = {
    command: "env",
    prefix: [
      `MISE_DATA_DIR=${resolve(miseRoot, "data")}`,
      `MISE_CACHE_DIR=${resolve(miseRoot, "cache")}`,
      `MISE_STATE_DIR=${resolve(miseRoot, "state")}`,
      "mise",
      "x",
      `uv@${UV_VERSION}`,
      "--",
      "uvx",
    ],
  };
  if (!(await commandWorks(pi, mise, cwd, 120_000))) return;
  return cachedUvRunner(cache);
}

async function writeSerenaConfig(cache: string, root: string) {
  await mkdir(cache, { recursive: true });
  const projectCache = resolve(cache, "projects");
  const yaml = [
    "projects: []",
    "web_dashboard: false",
    "web_dashboard_open_on_launch: false",
    "gui_log_window: false",
    `project_serena_folder_location: ${JSON.stringify(`${projectCache}/$projectFolderName`)}`,
    "trusted_project_path_patterns:",
    `  - ${JSON.stringify(root)}`,
    "",
  ].join("\n");
  await writeFile(resolve(cache, "serena_config.yml"), yaml, { mode: 0o600 });
}

async function writeMcporterConfig(
  cache: string,
  root: string,
  runner: Runner,
  allowInstall: boolean,
  runtimeEnv: Record<string, string>,
) {
  const path = resolve(cache, "mcporter.json");
  const offlineArgs = allowInstall ? [] : ["--offline"];
  const config = {
    mcpServers: {
      serena: {
        command: runner.command,
        cwd: root,
        args: [
          ...runner.prefix,
          ...offlineArgs,
          "--from",
          SERENA_PACKAGE,
          "serena",
          "start-mcp-server",
          "--project",
          root,
          "--context",
          "codex",
          "--enable-web-dashboard",
          "false",
          "--open-web-dashboard",
          "false",
          "--enable-gui-log-window",
          "false",
        ],
        env: {
          ...runtimeEnv,
          SERENA_HOME: cache,
          UV_CACHE_DIR: resolve(cache, "uv"),
          UV_PYTHON_INSTALL_DIR: resolve(cache, "python"),
        },
      },
    },
  };
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return path;
}

export async function withDirectoryLock<T>(cache: string, signal: AbortSignal | undefined, task: () => Promise<T>) {
  await mkdir(cache, { recursive: true });
  const lock = resolve(cache, ".install-lock");
  while (true) {
    if (signal?.aborted) throw new Error("code_intel was cancelled while waiting for its install lock");
    try {
      await mkdir(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() - (await stat(lock)).mtimeMs > 10 * 60_000) {
        await rm(lock, { recursive: true, force: true });
        continue;
      }
      await new Promise((done) => setTimeout(done, 100));
    }
  }
  try {
    return await task();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

function readyMarker(cache: string, path: string) {
  const language =
    extname(path)
      .slice(1)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "source";
  return resolve(cache, `.ready-${SERENA_VERSION}-${language}`);
}

async function isReady(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function bounded(text: string) {
  return text.length <= MAX_OUTPUT ? text : `${text.slice(0, MAX_OUTPUT)}\n… truncated`;
}

export function parseMcporterOutput(text: string) {
  const document = text.split("\n[mcporter]", 1)[0].trim();
  try {
    const parsed = JSON.parse(document) as { result?: unknown; content?: Array<{ type?: string; text?: string }> };
    if (typeof parsed.result === "string") return parsed.result;
    const content = parsed.content?.filter((item) => item.type === "text").map((item) => item.text ?? "");
    return content?.join("\n") || document;
  } catch {
    return document;
  }
}

function boundedError(text: string, root: string, cache: string) {
  const sanitized = parseMcporterOutput(text).replaceAll(root, "<project>").replaceAll(cache, "<cache>");
  const message = sanitized
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && line !== "{" && !line.startsWith("INFO ") && !line.startsWith("at "));
  return bounded(message || "Serena or its language server failed to start.").slice(0, 2_000);
}

export default function codeIntel(pi: ExtensionAPI) {
  pi.registerTool({
    name: "code_intel",
    label: "Code Intel",
    description:
      "Query definitions, references, hover information, symbols, or diagnostics through managed Serena language servers.",
    promptSnippet: "Query semantic code intelligence across supported project languages",
    promptGuidelines: [
      "Use code_intel for semantic navigation or diagnostics when text search cannot reliably identify a symbol.",
      "Pass project-relative paths and one-based positions.",
    ],
    parameters: PARAMS,
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (!ctx.isProjectTrusted()) throw new Error("code_intel requires a trusted project");
      const settings = (await getPibarmSettings(ctx)).codeIntel ?? {};
      if (settings.enabled === false) throw new Error("code_intel is disabled by pibarm.codeIntel.enabled");

      const { filePath, relativePath } = await confinedFile(ctx.cwd, params.path);
      const query =
        params.query?.trim() ||
        (params.line && params.column
          ? symbolAtPosition(await readFile(filePath, "utf8"), params.line, params.column)
          : undefined);
      const call = serenaCall(params.operation, relativePath, query, params.limit);
      const allowInstall = settings.autoInstall !== false && !offline();
      const cache = resolve(
        getAgentDir(),
        "pibarm",
        "code-intel",
        createHash("sha256")
          .update(await realpath(ctx.cwd))
          .digest("hex")
          .slice(0, 16),
      );
      return withDirectoryLock(cache, signal, async () => {
        const marker = readyMarker(cache, relativePath);
        if (!allowInstall && !(await isReady(marker))) {
          const text = "Code intelligence unavailable offline: no cached server is ready for this file type.";
          return { content: [{ type: "text" as const, text }], details: { available: false, manager: "serena" } };
        }
        const runner = await findRunner(pi, ctx.cwd, cache, allowInstall);
        if (!runner) {
          const text =
            "Code intelligence unavailable: install uv, or enable automatic installation with mise available.";
          return { content: [{ type: "text" as const, text }], details: { available: false, manager: "serena" } };
        }

        const root = await realpath(ctx.cwd);
        const runtimeEnv: Record<string, string> = {};
        if (isAbsolute(runner.command))
          runtimeEnv.PATH = `${dirname(runner.command)}${delimiter}${process.env.PATH ?? ""}`;
        if (!allowInstall) {
          runtimeEnv.UV_OFFLINE = "1";
          runtimeEnv.npm_config_offline = "true";
          runtimeEnv.PIP_NO_INDEX = "1";
          runtimeEnv.HTTP_PROXY = "http://127.0.0.1:9";
          runtimeEnv.HTTPS_PROXY = "http://127.0.0.1:9";
          runtimeEnv.ALL_PROXY = "http://127.0.0.1:9";
          runtimeEnv.NO_PROXY = "";
        }
        const ruby = await pi.exec("mise", ["latest", "--installed", "ruby"], { cwd: root, timeout: 10_000 });
        if (ruby.code === 0 && ruby.stdout.trim()) runtimeEnv.MISE_RUBY_VERSION = ruby.stdout.trim();
        await writeSerenaConfig(cache, root);
        const config = await writeMcporterConfig(cache, root, runner, allowInstall, runtimeEnv);
        const result = await pi.exec(
          "mcporter",
          [
            "--config",
            config,
            "--root",
            ctx.cwd,
            "call",
            `serena.${call.tool}`,
            "--args",
            JSON.stringify(call.arguments),
            "--output",
            "json",
            ...(allowInstall ? [] : ["--no-oauth"]),
          ],
          { cwd: ctx.cwd, signal, timeout: settings.timeoutMs ?? 300_000 },
        );
        if (result.code !== 0) {
          const reason = boundedError(
            (result.stderr || result.stdout || `mcporter exited ${result.code}`).trim(),
            root,
            cache,
          );
          return {
            content: [{ type: "text" as const, text: `Code intelligence unavailable: ${reason}` }],
            details: { available: false, manager: "serena", operation: params.operation },
          };
        }
        const output = bounded(parseMcporterOutput(result.stdout) || "No semantic results.");
        await writeFile(marker, `${JSON.stringify({ manager: "serena", version: SERENA_VERSION })}\n`, { mode: 0o600 });
        return {
          content: [{ type: "text" as const, text: output }],
          details: {
            available: true,
            manager: "serena",
            managerVersion: SERENA_VERSION,
            operation: params.operation,
            path: relativePath,
            truncated: output.endsWith("… truncated"),
          },
        };
      });
    },
  });
}
