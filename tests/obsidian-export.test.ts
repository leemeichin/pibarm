import { describe, expect, test } from "bun:test";
import { claimNotePath, parseForgeRemote } from "../lib/obsidian-export.js";

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
