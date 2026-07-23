import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyCommitTrailerInstruction, commitTrailerInstruction } from "../extensions/pibarm-settings.js";
import {
  mergePibarmSettings,
  normalizeObsidianSettings,
  sanitizeBasePath,
  updatePibarmSettings,
} from "../lib/pibarm-settings.js";

describe("sanitizeBasePath", () => {
  test("keeps simple relative paths", () => {
    expect(sanitizeBasePath("Pi/Sessions")).toBe("Pi/Sessions");
  });

  test("strips traversal and absolute segments", () => {
    expect(sanitizeBasePath("../../anywhere/writable")).toBe("anywhere/writable");
    expect(sanitizeBasePath("/etc")).toBe("etc");
    expect(sanitizeBasePath("a/./../b")).toBe("a/b");
    expect(sanitizeBasePath("..")).toBe("");
  });
});

describe("mergePibarmSettings", () => {
  const global = { pibarm: { obsidian: { vault: "~/vault", autoSync: false } } };
  const project = { pibarm: { obsidian: { vault: "/attacker/vault", basePath: "../escape", autoSync: true } } };

  test("ignores project settings when the project is untrusted", () => {
    const settings = mergePibarmSettings(global, project, false);
    expect(settings.obsidian?.vault).toBe("~/vault");
    expect(settings.obsidian?.autoSync).toBe(false);
    expect(settings.obsidian?.basePath).toBeUndefined();
  });

  test("merges project settings over global when trusted", () => {
    const settings = mergePibarmSettings(global, project, true);
    expect(settings.obsidian?.vault).toBe("/attacker/vault");
    expect(settings.obsidian?.autoSync).toBe(true);
  });

  test("reads automatic agent-pane settings", () => {
    const settings = mergePibarmSettings({ pibarm: { agentPanes: { multiplexer: "zellij" } } }, {}, false);
    expect(settings.agentPanes?.multiplexer).toBe("zellij");
  });
});

describe("normalizeObsidianSettings", () => {
  test("sanitizes traversal out of basePath", () => {
    const settings = normalizeObsidianSettings({ vault: "/vault", basePath: "../../etc" }, "/project");
    expect(settings.basePath).toBe("etc");
  });

  test("falls back to the default basePath when sanitization empties it", () => {
    const settings = normalizeObsidianSettings({ vault: "/vault", basePath: "../.." }, "/project");
    expect(settings.basePath).toBe("Pi");
  });

  test("is unconfigured without a vault", () => {
    const settings = normalizeObsidianSettings({}, "/project");
    expect(settings.configured).toBe(false);
    expect(settings.basePath).toBe("Pi");
  });

  test("resolves relative vault paths against cwd", () => {
    const settings = normalizeObsidianSettings({ vault: "notes" }, "/project");
    expect(settings.vault).toBe("/project/notes");
    expect(settings.configured).toBe(true);
  });
});

describe("pibarm settings editor", () => {
  test("atomically updates changed values while preserving unknown settings", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pibarm-settings-"));
    const path = join(directory, "settings.json");
    await writeFile(path, '{"theme":"dark","pibarm":{"future":{"kept":true},"git":{"other":"kept"}}}\n');

    await updatePibarmSettings(path, [
      { path: ["git", "commitTrailer"], value: false },
      { path: ["obsidian", "debounceMs"], value: 500 },
    ]);

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      theme: "dark",
      pibarm: {
        future: { kept: true },
        git: { other: "kept", commitTrailer: false },
        obsidian: { debounceMs: 500 },
      },
    });
    expect(await readdir(directory)).toEqual(["settings.json"]);
  });
});

describe("commit trailer instruction", () => {
  test("uses the package version and is enabled by default", () => {
    const instruction =
      "When creating a Git commit, add this exact trailer as the final line of the commit message:\nCo-authored-by: 🥧 pibarm v0.1.0";
    expect(commitTrailerInstruction()).toBe(instruction);
    expect(applyCommitTrailerInstruction("base", {})).toBe(`base\n\n${instruction}`);
  });

  test("can be disabled", () => {
    expect(applyCommitTrailerInstruction("base", { git: { commitTrailer: false } })).toBeUndefined();
  });
});
