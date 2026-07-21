import { describe, expect, test } from "bun:test";
import promptContext from "../extensions/prompt-context.js";
import { effectiveProjectContext, filterSystemPromptContext } from "../lib/prompt-context.js";

const block = (path: string, content: string) =>
  `<project_instructions path="${path}">\n${content}\n</project_instructions>\n\n`;

describe("project prompt context", () => {
  test("keeps only instructions inside the current worktree root", () => {
    const parent = { path: "/repo/AGENTS.md", content: "parent" };
    const worktree = { path: "/repo/.pi/wt/task/AGENTS.md", content: "worktree" };
    const files = [parent, worktree];
    const effective = effectiveProjectContext(files, "/repo/.pi/wt/task");

    expect(effective).toEqual([worktree]);
    expect(
      filterSystemPromptContext(
        block(parent.path, parent.content) + block(worktree.path, worktree.content),
        files,
        effective,
      ),
    ).toBe(block(worktree.path, worktree.content));
  });

  test("deduplicates identical instructions when no git root is available", () => {
    const files = [
      { path: "/one/AGENTS.md", content: "same" },
      { path: "/two/AGENTS.md", content: "same" },
    ];
    expect(effectiveProjectContext(files)).toEqual([files[1]]);
  });

  test("applies the filter in the before-agent hook", async () => {
    let handler: any;
    const pi = {
      on(name: string, callback: any) {
        if (name === "before_agent_start") handler = callback;
      },
      async exec() {
        return { code: 0, stdout: "/repo/worktree\n", stderr: "" };
      },
    };
    const files = [
      { path: "/repo/AGENTS.md", content: "parent" },
      { path: "/repo/worktree/AGENTS.md", content: "current" },
    ];
    promptContext(pi as never);

    const result = await handler(
      {
        systemPrompt: files.map((file) => block(file.path, file.content)).join(""),
        systemPromptOptions: { contextFiles: files },
      },
      { cwd: "/repo/worktree" },
    );
    expect(result.systemPrompt).toBe(block(files[1]!.path, files[1]!.content));
  });
});
