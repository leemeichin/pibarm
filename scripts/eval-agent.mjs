#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.split(/=(.*)/s, 2)));
const model = args["--model"];
const variant = args["--variant"] ?? "baseline";
const runs = Number(args["--runs"] ?? 1);
if (!model || !["baseline", "code-intel"].includes(variant) || !Number.isInteger(runs) || runs < 1 || runs > 2) {
  console.error("Usage: bun run eval:agent --model=<provider/model> --variant=<baseline|code-intel> [--runs=1|2]");
  process.exit(2);
}

const scenarios = [
  {
    name: "typescript",
    verify: ["node", "--test", "test/pricing.test.ts"],
    prompt:
      "The TypeScript pricing test fails for percentage discounts. Fix the root cause without changing the test or public API, then run the verification command. Use semantic code intelligence if available before broad text search.",
    files: {
      "package.json": `{"type":"module"}\n`,
      "src/discount.ts": `export function discountedCents(cents: number, rate: number) {\n  return cents - rate;\n}\n`,
      "src/pricing.ts": `import { discountedCents } from "./discount.ts";\nexport const checkoutTotal = (cents: number) => discountedCents(cents, 0.2);\n`,
      "test/pricing.test.ts": `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { checkoutTotal } from "../src/pricing.ts";\ntest("percentage discount", () => assert.equal(checkoutTotal(2500), 2000));\n`,
    },
  },
  {
    name: "vue",
    verify: ["node", "--test", "test/cart.test.ts"],
    prompt:
      "The Vue cart total ignores item quantities. Fix the shared root cause without changing the component, test, or exported API, then run the verification command. Use semantic code intelligence if available before broad text search.",
    files: {
      "package.json": `{"type":"module","dependencies":{"vue":"^3.5.0"}}\n`,
      "src/CartSummary.vue": `<script setup lang="ts">\nimport { cartTotal, type Item } from "./cart.ts";\nconst items: Item[] = [{ price: 500, quantity: 2 }];\n</script>\n<template><output>{{ cartTotal(items) }}</output></template>\n`,
      "src/cart.ts": `export type Item = { price: number; quantity: number };\nexport const cartTotal = (items: Item[]) => items.reduce((sum, item) => sum + item.price, 0);\n`,
      "test/cart.test.ts": `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { cartTotal } from "../src/cart.ts";\ntest("quantities", () => assert.equal(cartTotal([{ price: 500, quantity: 2 }, { price: 250, quantity: 1 }]), 1250));\n`,
    },
  },
  {
    name: "python",
    verify: "python",
    prompt:
      "The Python ledger test shows that refunds increase the balance. Fix the shared domain function without changing the test or public API, then run the verification command. Use semantic code intelligence if available before broad text search.",
    files: {
      "ledger.py": `def apply_entry(balance: int, amount: int, kind: str) -> int:\n    if kind == "refund":\n        return balance + amount\n    return balance + amount\n`,
      "service.py": `from ledger import apply_entry\n\ndef settle(balance: int, entries: list[tuple[int, str]]) -> int:\n    for amount, kind in entries:\n        balance = apply_entry(balance, amount, kind)\n    return balance\n`,
      "test_ledger.py": `import unittest\nfrom service import settle\n\nclass LedgerTest(unittest.TestCase):\n    def test_refunds_reduce_balance(self):\n        self.assertEqual(settle(1000, [(250, "charge"), (100, "refund")]), 1150)\n`,
    },
  },
  {
    name: "ruby",
    verify: "ruby",
    prompt:
      "The Ruby invoice test shows cancelled line items in the total. Fix the shared root cause without changing the test or public API, then run the verification command. Use semantic code intelligence if available before broad text search.",
    files: {
      "lib/line_item.rb": `LineItem = Data.define(:cents, :cancelled)\n\ndef billable_cents(item)\n  item.cents\nend\n`,
      "lib/invoice.rb": `require_relative "line_item"\n\ndef invoice_total(items)\n  items.sum { |item| billable_cents(item) }\nend\n`,
      "test/invoice_test.rb": `require "minitest/autorun"\nrequire_relative "../lib/invoice"\n\nclass InvoiceTest < Minitest::Test\n  def test_cancelled_items_are_excluded\n    items = [LineItem.new(500, false), LineItem.new(250, true)]\n    assert_equal 500, invoice_total(items)\n  end\nend\n`,
    },
  },
];

function commandExists(command) {
  return spawnSync(command, ["--version"], { stdio: "ignore", timeout: 5_000 }).status === 0;
}

function verificationCommand(scenario) {
  if (Array.isArray(scenario.verify)) return scenario.verify;
  if (scenario.verify === "python") {
    if (commandExists("python3")) return ["python3", "-m", "unittest"];
    if (commandExists("python")) return ["python", "-m", "unittest"];
    if (commandExists("nix-shell")) return ["nix-shell", "-p", "python3", "--run", "python -m unittest"];
    return ["mise", "exec", "python@3.12", "--", "python", "-m", "unittest"];
  }
  if (commandExists("ruby")) return ["ruby", "test/invoice_test.rb"];
  return ["mise", "exec", "ruby@3.4.10", "--", "ruby", "test/invoice_test.rb"];
}

function run(command, commandArgs, options) {
  return new Promise((done) => {
    const child = spawn(command, commandArgs, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 10 * 60_000);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      done({ code, signal, stdout, stderr });
    });
  });
}

function metrics(output) {
  const events = output
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  const tools = events.filter((event) => event.type === "tool_execution_start").map((event) => event.toolName);
  const usage = events
    .filter((event) => event.type === "message_end" && event.message?.role === "assistant")
    .map((event) => event.message.usage ?? {});
  const sum = (key) => usage.reduce((total, item) => total + Number(item[key] ?? 0), 0);
  return {
    toolCalls: tools.length,
    codeIntelCalls: tools.filter((name) => name === "code_intel").length,
    inputTokens: sum("input"),
    outputTokens: sum("output"),
    cacheReadTokens: sum("cacheRead"),
    cacheWriteTokens: sum("cacheWrite"),
    cost: usage.reduce((total, item) => total + Number(item.cost?.total ?? 0), 0),
  };
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = join(root, ".pi", "evals", `${stamp}-${variant}`);
await mkdir(outputDir, { recursive: true });
const results = [];

for (let runIndex = 1; runIndex <= runs; runIndex++) {
  for (const scenario of scenarios) {
    const cwd = join(outputDir, `${scenario.name}-${runIndex}`);
    await rm(cwd, { recursive: true, force: true });
    for (const [path, content] of Object.entries(scenario.files)) {
      const target = join(cwd, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    spawnSync("git", ["init", "-q"], { cwd });

    const extensions = ["--extension", join(root, "extensions", "tool-search.ts")];
    if (variant === "code-intel") extensions.push("--extension", join(root, "extensions", "code-intel.ts"));
    const started = performance.now();
    const agent = await run(
      "pi",
      [
        "--mode",
        "json",
        "--print",
        "--no-session",
        "--approve",
        "--no-context-files",
        "--no-skills",
        "--model",
        model,
        "--tools",
        `read,bash,edit,write,search_tools${variant === "code-intel" ? ",code_intel" : ""}`,
        ...extensions,
        scenario.prompt,
      ],
      { cwd },
    );
    const durationMs = Math.round(performance.now() - started);
    await writeFile(join(cwd, "events.jsonl"), agent.stdout);
    await writeFile(join(cwd, "stderr.log"), agent.stderr);
    const verify = verificationCommand(scenario);
    const verification = spawnSync(verify[0], verify.slice(1), { cwd, encoding: "utf8", timeout: 120_000 });
    const result = {
      scenario: scenario.name,
      run: runIndex,
      success: agent.code === 0 && verification.status === 0,
      agentExit: agent.code,
      verificationExit: verification.status,
      durationMs,
      ...metrics(agent.stdout),
    };
    results.push(result);
    console.log(`${result.success ? "✓" : "✗"} ${scenario.name} run ${runIndex} (${durationMs} ms)`);
  }
}

const report = {
  model,
  variant,
  runs,
  success: results.filter((result) => result.success).length,
  total: results.length,
  totals: results.reduce(
    (total, result) => ({
      durationMs: total.durationMs + result.durationMs,
      toolCalls: total.toolCalls + result.toolCalls,
      codeIntelCalls: total.codeIntelCalls + result.codeIntelCalls,
      inputTokens: total.inputTokens + result.inputTokens,
      outputTokens: total.outputTokens + result.outputTokens,
      cacheReadTokens: total.cacheReadTokens + result.cacheReadTokens,
      cacheWriteTokens: total.cacheWriteTokens + result.cacheWriteTokens,
      cost: total.cost + result.cost,
    }),
    {
      durationMs: 0,
      toolCalls: 0,
      codeIntelCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cost: 0,
    },
  ),
  results,
};
await writeFile(join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `\n${report.success}/${report.total} successful; sanitized report: ${join(".pi", "evals", `${stamp}-${variant}`, "report.json")}`,
);
