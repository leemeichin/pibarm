import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildWatcherScript, type WatcherScriptOptions } from "../extensions/watch-agent.js";

async function makeScript(overrides: Partial<WatcherScriptOptions> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "pibarm-watch-"));
  const options: WatcherScriptOptions = {
    name: "test",
    dir,
    logPath: join(dir, "watch.log"),
    stopPath: join(dir, "stop"),
    statusPath: join(dir, "status"),
    watchCommand: "echo hello",
    piCommand: "echo [fake-agent-run]",
    intervalSeconds: 15,
    maxIterations: 1,
    ...overrides,
  };
  const scriptPath = join(dir, "watch.sh");
  await writeFile(scriptPath, buildWatcherScript(options), { encoding: "utf8", mode: 0o700 });
  return { dir, options, scriptPath };
}

describe("buildWatcherScript", () => {
  test("falls back across sha256sum/shasum/cksum instead of requiring shasum", () => {
    const script = buildWatcherScript({
      name: "t",
      dir: "/d",
      logPath: "/d/l",
      stopPath: "/d/s",
      statusPath: "/d/st",
      watchCommand: "true",
      piCommand: "true",
      intervalSeconds: 15,
      maxIterations: 1,
    });
    expect(script).toContain("command -v sha256sum");
    expect(script).toContain("command -v shasum");
    expect(script).toContain("cksum");
    expect(script).toContain("hashing output failed");
  });

  test("detects a change, runs the agent command, and records completion status", async () => {
    // Regression: on Linux (no shasum) the watcher hashed to "" forever and
    // never fired. This runs the real script end to end.
    const { options, scriptPath } = await makeScript();
    const result = spawnSync("bash", [scriptPath], { encoding: "utf8", timeout: 20000 });
    expect(result.status).toBe(0);
    const log = await readFile(options.logPath, "utf8");
    expect(log).toContain("change detected iteration 1");
    expect(log).toContain("[fake-agent-run]");
    const status = await readFile(options.statusPath, "utf8");
    expect(status.trim()).toBe("max iterations reached");
  });

  test("honors the stop file and records stopped status", async () => {
    const { options, scriptPath } = await makeScript({ maxIterations: 5 });
    await writeFile(options.stopPath, "stop\n", "utf8");
    const result = spawnSync("bash", [scriptPath], { encoding: "utf8", timeout: 20000 });
    expect(result.status).toBe(0);
    const status = await readFile(options.statusPath, "utf8");
    expect(status.trim()).toBe("stopped");
    const log = await readFile(options.logPath, "utf8");
    expect(log).not.toContain("change detected");
  });
});
