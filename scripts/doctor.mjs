#!/usr/bin/env node
import { access, copyFile, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write") || process.argv.includes("--setup");

const checks = [];
const actions = [];

function run(command, args = [], timeout = 5000) {
  return spawnSync(command, args, { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] });
}

function has(command) {
  // Pass the name as a positional parameter so env-derived values are never
  // interpolated into shell syntax ($(...), backticks, $var all stay literal).
  const result = run("bash", ["-lc", 'command -v "$1" >/dev/null 2>&1', "doctor", command]);
  return result.status === 0;
}

function ok(name, detail = "") {
  checks.push({ status: "ok", name, detail });
}

function warn(name, detail = "") {
  checks.push({ status: "warn", name, detail });
}

function fail(name, detail = "") {
  checks.push({ status: "fail", name, detail });
}

async function exists(path) {
  try {
    await access(resolve(root, path), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function copyExample(example, target) {
  if (await exists(target)) {
    ok(target, "present");
    return;
  }
  if (!write) {
    warn(target, `missing; run 'bun run setup' or copy ${example}`);
    return;
  }
  await copyFile(resolve(root, example), resolve(root, target));
  actions.push(`created ${target}`);
  ok(target, "created from example");
}

function commandCheck(command, { required = false, install = "", detail = "" } = {}) {
  if (has(command)) {
    ok(command, detail || "found");
    return true;
  }
  const message = [detail || "not found", install && `install: ${install}`].filter(Boolean).join("; ");
  (required ? fail : warn)(command, message);
  return false;
}

async function main() {
  console.log("pibarm setup doctor\n");

  commandCheck("pi", {
    required: true,
    install: "https://pi.dev / your normal pi installer",
    detail: "required to load this package and run subagents",
  });
  commandCheck("git", {
    required: true,
    install: "brew install git",
    detail: "required for repo status and worktrees",
  });
  commandCheck("bash", { required: true, detail: "required by watchers and subagent wrappers" });
  commandCheck("bun", {
    install: "curl -fsSL https://bun.sh/install | bash",
    detail: "needed for development checks (bun run check)",
  });

  commandCheck("gh", { install: "brew install gh && gh auth login", detail: "GitHub PR/CI tools" });
  if (has("gh")) {
    const auth = run("gh", ["auth", "status"], 8000);
    if (auth.status === 0) ok("gh auth", "authenticated");
    else warn("gh auth", "run 'gh auth login' for GitHub PR/CI tools");
  }

  commandCheck("hut", { install: "brew install hut && hut init", detail: "SourceHut build/ticket tools" });
  commandCheck("mcporter", {
    install: "install/configure mcporter, then edit .pi/mcporter.json",
    detail: "MCP bridge tools and managed code intelligence",
  });
  if (has("uvx") || has("uv")) ok("code intelligence runtime", "uv found");
  else if (has("mise")) ok("code intelligence runtime", "mise can install pinned uv into the pibarm cache");
  else warn("code intelligence runtime", "install uv or mise to use managed Serena language servers");
  commandCheck("wezterm", { install: "brew install --cask wezterm", detail: "Butty visible agent panes" });
  commandCheck(process.env.PI_NOTIFY_TERMINAL_NOTIFIER || "terminal-notifier", {
    install: "brew install terminal-notifier",
    detail: "optional native macOS notifications",
  });

  await copyExample(".pi/mcporter.example.json", ".pi/mcporter.json");
  await copyExample(".pi/agent-presets.example.json", ".pi/agent-presets.json");

  try {
    const settings = JSON.parse(await readFile(resolve(root, ".pi/settings.json"), "utf8"));
    const packages = settings.packages ?? [];
    const ponytail = "git:github.com/DietrichGebert/ponytail";
    if (packages.some((pkg) => String(pkg) === ponytail || String(pkg).startsWith(`${ponytail}@`)))
      ok(".pi/settings.json", "ponytail package configured");
    else warn(".pi/settings.json", "ponytail package is not configured");
    if (packages.some((pkg) => /cmux/i.test(String(pkg))))
      warn(".pi/settings.json", "cmux package still configured; remove it if you want pibarm-only Butty/notifications");
  } catch (error) {
    fail(".pi/settings.json", `could not parse: ${error.message}`);
  }

  console.log(
    checks
      .map((check) => {
        const icon = check.status === "ok" ? "✓" : check.status === "warn" ? "!" : "✗";
        return `${icon} ${check.name}${check.detail ? ` — ${check.detail}` : ""}`;
      })
      .join("\n"),
  );

  if (actions.length) console.log(`\nActions:\n${actions.map((action) => `- ${action}`).join("\n")}`);

  const failures = checks.filter((check) => check.status === "fail");
  const warnings = checks.filter((check) => check.status === "warn");
  console.log(`\nSummary: ${failures.length} failure(s), ${warnings.length} warning(s).`);
  if (warnings.length)
    console.log("Warnings are feature-specific; core plan/worktree usage only needs the required checks.");
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
