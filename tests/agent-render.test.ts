import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RENDERER = fileURLToPath(new URL("../scripts/agent-render.mjs", import.meta.url));

function render(lines: unknown[]): string {
  const input = lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n");
  const result = spawnSync(process.execPath, [RENDERER], { input, encoding: "utf8", timeout: 15000 });
  expect(result.status).toBe(0);
  return result.stdout;
}

describe("agent-render", () => {
  test("streams thinking and response deltas with section markers", () => {
    const output = render([
      { type: "agent_start" },
      { type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: "Let me check the file." } },
      { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "The bug is in " } },
      { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "main.ts." } },
      { type: "agent_end", messages: [] },
    ]);
    expect(output).toContain("· thinking ·");
    expect(output).toContain("Let me check the file.");
    expect(output).toContain("· response ·");
    expect(output).toContain("The bug is in main.ts.");
  });

  test("shows tool activity with args and result previews", () => {
    const output = render([
      { type: "tool_execution_start", toolCallId: "1", toolName: "bash", args: { command: "ls -la" } },
      {
        type: "tool_execution_end",
        toolCallId: "1",
        toolName: "bash",
        isError: false,
        result: { content: [{ type: "text", text: "file-a.ts\nfile-b.ts" }] },
      },
      { type: "tool_execution_start", toolCallId: "2", toolName: "read", args: { path: "x.ts" } },
      {
        type: "tool_execution_end",
        toolCallId: "2",
        toolName: "read",
        isError: true,
        result: { content: [{ type: "text", text: "ENOENT" }] },
      },
    ]);
    expect(output).toContain("▶ bash");
    expect(output).toContain("ls -la");
    expect(output).toContain("✔ bash: file-a.ts");
    expect(output).toContain("✖ read: ENOENT");
  });

  test("reports errored assistant messages", () => {
    const output = render([
      { type: "message_end", message: { role: "assistant", stopReason: "error", errorMessage: "rate limited" } },
    ]);
    expect(output).toContain("[error] rate limited");
  });

  test("passes through non-JSON lines like stderr noise", () => {
    const output = render(["Extension error (foo.ts): boom", { type: "agent_end", messages: [] }]);
    expect(output).toContain("Extension error (foo.ts): boom");
  });
});
