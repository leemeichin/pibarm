import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import codeIntel, {
  confinedFile,
  parseMcporterOutput,
  serenaCall,
  symbolAtPosition,
  withDirectoryLock,
} from "../extensions/code-intel.js";

describe("code intelligence", () => {
  test("infers identifiers from one-based positions", () => {
    const source = "const total = invoice.amount;\nputs total\n";
    expect(symbolAtPosition(source, 1, 9)).toBe("total");
    expect(symbolAtPosition(source, 1, 15)).toBe("invoice");
    expect(symbolAtPosition(source, 2, 6)).toBe("total");
    expect(symbolAtPosition(source, 9, 1)).toBeUndefined();
  });

  test("maps the bounded public operations to Serena tools", () => {
    expect(serenaCall("symbols", "src/a.ts", undefined).tool).toBe("get_symbols_overview");
    expect(serenaCall("definition", "src/a.ts", "total", 3)).toEqual({
      tool: "find_symbol",
      arguments: {
        name_path_pattern: "total",
        relative_path: "src/a.ts",
        include_body: false,
        include_info: false,
        max_matches: 3,
        max_answer_chars: 20_000,
      },
    });
    expect(serenaCall("references", "src/a.ts", "total").tool).toBe("find_referencing_symbols");
    expect(serenaCall("diagnostics", "src/a.ts", undefined).tool).toBe("get_diagnostics_for_file");
    expect(() => serenaCall("hover", "src/a.ts", undefined)).toThrow("requires query");
  });

  test("drops child-process logs from mcporter JSON output", () => {
    expect(parseMcporterOutput('{"result":"semantic result"}\n[mcporter] stderr from /private/path\nINFO noisy')).toBe(
      "semantic result",
    );
    expect(parseMcporterOutput('{"content":[{"type":"text","text":"language server failed"}],"isError":true}')).toBe(
      "language server failed",
    );
  });

  test("rejects files and symlinks outside the project", async () => {
    const parent = await mkdtemp(join(tmpdir(), "pibarm-code-intel-"));
    const root = join(parent, "project");
    await mkdir(root);
    await writeFile(join(root, "inside.ts"), "export const ok = true;\n");
    await writeFile(join(parent, "outside.ts"), "secret\n");
    await symlink(join(parent, "outside.ts"), join(root, "escape.ts"));

    await expect(confinedFile(root, "inside.ts")).resolves.toMatchObject({ relativePath: "inside.ts" });
    await expect(confinedFile(root, "../outside.ts")).rejects.toThrow("inside the project");
    await expect(confinedFile(root, "escape.ts")).rejects.toThrow("inside the project");
  });

  test("serializes concurrent server installation for one project", async () => {
    const cache = await mkdtemp(join(tmpdir(), "pibarm-code-intel-lock-"));
    let active = 0;
    let maxActive = 0;
    const task = () =>
      withDirectoryLock(cache, undefined, async () => {
        maxActive = Math.max(maxActive, ++active);
        await Bun.sleep(125);
        active--;
      });
    await Promise.all([task(), task()]);
    expect(maxActive).toBe(1);
  });

  test("offline mode never invokes the automatic mise installer", async () => {
    const root = await mkdtemp(join(tmpdir(), "pibarm-code-intel-offline-"));
    await writeFile(join(root, "a.ts"), "export const value = 1;\n");
    let tool: any;
    const commands: string[] = [];
    codeIntel({
      registerTool(value: any) {
        tool = value;
      },
      async exec(command: string) {
        commands.push(command);
        return { code: 127, stdout: "", stderr: "missing", killed: false };
      },
    } as never);

    const previous = process.env.PI_OFFLINE;
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_OFFLINE = "1";
    process.env.PI_CODING_AGENT_DIR = join(root, "agent");
    try {
      const result = await tool.execute("call", { operation: "symbols", path: "a.ts" }, undefined, undefined, {
        cwd: root,
        isProjectTrusted: () => true,
      });
      expect(result.details.available).toBe(false);
      expect(commands).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.PI_OFFLINE;
      else process.env.PI_OFFLINE = previous;
      if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    }
  });

  test("refuses untrusted projects before executing a process", async () => {
    let tool: any;
    let executions = 0;
    codeIntel({
      registerTool(value: any) {
        tool = value;
      },
      async exec() {
        executions++;
        return { code: 0, stdout: "", stderr: "", killed: false };
      },
    } as never);

    expect(tool.executionMode).toBe("sequential");
    await expect(
      tool.execute("call", { operation: "symbols", path: "src/a.ts" }, undefined, undefined, {
        cwd: process.cwd(),
        isProjectTrusted: () => false,
      }),
    ).rejects.toThrow("trusted project");
    expect(executions).toBe(0);
  });
});
