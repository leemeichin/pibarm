import { describe, expect, test } from "bun:test";
import { mergePibarmSettings, normalizeObsidianSettings, sanitizeBasePath } from "../lib/pibarm-settings.js";

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

  test("reads the Butty auto-spawn setting", () => {
    const settings = mergePibarmSettings({ pibarm: { butty: { autoSpawn: true } } }, {}, false);
    expect(settings.butty?.autoSpawn).toBe(true);
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
