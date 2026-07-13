import { describe, expect, test } from "bun:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { claimNotePath, jiraIssueName, parseForgeRemote, renderEntry, usableBranch } from "../lib/obsidian-export.js";

describe("parseForgeRemote", () => {
  test("parses scp-style GitHub remotes", () => {
    expect(parseForgeRemote("git@github.com:leemeichin/pibarm.git")).toEqual({ org: "leemeichin", repo: "pibarm" });
  });

  test("parses https remotes with and without .git", () => {
    expect(parseForgeRemote("https://github.com/leemeichin/pibarm.git")).toEqual({ org: "leemeichin", repo: "pibarm" });
    expect(parseForgeRemote("https://github.com/leemeichin/pibarm")).toEqual({ org: "leemeichin", repo: "pibarm" });
  });

  test("parses SourceHut remotes and strips the ~ prefix", () => {
    expect(parseForgeRemote("https://git.sr.ht/~lee/pibarm")).toEqual({ org: "lee", repo: "pibarm" });
    expect(parseForgeRemote("git@git.sr.ht:~lee/pibarm")).toEqual({ org: "lee", repo: "pibarm" });
  });

  test("uses the nearest group for nested GitLab paths", () => {
    expect(parseForgeRemote("https://gitlab.com/group/subgroup/repo.git")).toEqual({ org: "subgroup", repo: "repo" });
  });

  test("returns undefined for unusable urls", () => {
    expect(parseForgeRemote("")).toBeUndefined();
    expect(parseForgeRemote("not a remote")).toBeUndefined();
    expect(parseForgeRemote("https://github.com/")).toBeUndefined();
  });
});

describe("session name fallbacks", () => {
  test("extracts a Jira key and nested summary from recent context", () => {
    const entries = [
      {
        type: "message",
        message: {
          role: "toolResult",
          content: [{ type: "text", text: JSON.stringify({ key: "ABC-123", fields: { summary: "Fix login" } }) }],
        },
      },
    ] as SessionEntry[];
    expect(jiraIssueName(entries)).toBe("ABC-123 Fix login");
  });

  test("uses only non-generic branches", () => {
    expect(usableBranch("feature/ABC-123\n")).toBe("feature/ABC-123");
    expect(usableBranch("main\n")).toBeUndefined();
    expect(usableBranch("")).toBeUndefined();
  });
});

describe("compact transcript rendering", () => {
  test("renders tool calls and results as bounded rows", () => {
    const call = {
      type: "message",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "1", name: "read", arguments: { path: "src/app.ts" } }],
      },
    } as SessionEntry;
    const result = {
      type: "message",
      message: {
        role: "toolResult",
        toolName: "read",
        content: [{ type: "text", text: `${"output ".repeat(40)}\nsecond line` }],
        isError: false,
      },
    } as SessionEntry;

    expect(renderEntry(call)).toContain('> **read** — `{"path":"src/app.ts"}`');
    expect(renderEntry(result)).toMatch(/^> \*\*read result\*\* — 2 lines, \d+ chars — .+…\n$/);
  });
});

describe("claimNotePath", () => {
  const index = (sessions: Record<string, { path: string; named: boolean }>) => ({ version: 1 as const, sessions });

  test("claims the plain name when free", () => {
    expect(claimNotePath(index({}), "abc12345", "org/repo", "fix-the-bug")).toBe("org/repo/fix-the-bug.md");
  });

  test("keeps the same path when this session already owns it", () => {
    const idx = index({ abc12345: { path: "org/repo/fix-the-bug.md", named: true } });
    expect(claimNotePath(idx, "abc12345", "org/repo", "fix-the-bug")).toBe("org/repo/fix-the-bug.md");
  });

  test("disambiguates when another session owns the name", () => {
    const idx = index({ other000: { path: "org/repo/fix-the-bug.md", named: true } });
    expect(claimNotePath(idx, "abc12345", "org/repo", "fix-the-bug")).toBe("org/repo/fix-the-bug-abc12345.md");
  });

  test("does not collide across repos", () => {
    const idx = index({ other000: { path: "org/other-repo/fix-the-bug.md", named: true } });
    expect(claimNotePath(idx, "abc12345", "org/repo", "fix-the-bug")).toBe("org/repo/fix-the-bug.md");
  });
});
