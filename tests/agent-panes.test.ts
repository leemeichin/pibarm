import { describe, expect, test } from "bun:test";
import { normalizeAgentPanesSettings, tmuxControlCommand } from "../lib/agent-runner.js";

describe("automatic agent panes", () => {
  test("defaults standard delegation to detached tiled tmux panes", () => {
    expect(normalizeAgentPanesSettings()).toEqual({
      enabled: "auto",
      include: ["subagent", "worktree"],
      outsideTmux: "detached",
      layout: "tiled",
    });
  });

  test("honors disable, headless, and bounded include settings", () => {
    expect(
      normalizeAgentPanesSettings({
        enabled: false,
        include: ["subagent", "subagent", "invalid" as never],
        outsideTmux: "headless",
      }),
    ).toEqual({ enabled: false, include: ["subagent"], outsideTmux: "headless", layout: "tiled" });
  });

  test("quotes control-mode arguments without shell interpolation", () => {
    expect(tmuxControlCommand(["split-window", "-c", "/tmp/a b", "bash", "-lc", "printf '$HOME; ok'"])).toBe(
      `'split-window' '-c' '/tmp/a b' 'bash' '-lc' 'printf '"'"'$HOME; ok'"'"''`,
    );
  });

  test("keeps removed pane brands and tool APIs out of the repository", () => {
    const oldBrand = `${"but"}ty|${"wez"}term`;
    const oldTools = `${"matrix"}_(spawn|attach|capture|join|list|kill)|/${"matrix"}([- ]|$)`;
    const result = Bun.spawnSync(
      [
        "rg",
        "-n",
        "-i",
        "--hidden",
        "--glob",
        "!.git/**",
        "--glob",
        "!node_modules/**",
        "--glob",
        "!site/dist/**",
        `${oldBrand}|${oldTools}`,
        ".",
      ],
      { cwd: new URL("..", import.meta.url).pathname, stdout: "pipe", stderr: "pipe" },
    );
    expect(result.exitCode, result.stdout.toString()).toBe(1);
  });
});
