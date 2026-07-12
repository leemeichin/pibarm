import { describe, expect, test } from "bun:test";
import { detectPrRefs, offerPrWatcher } from "../extensions/agent-presets.js";

describe("detectPrRefs", () => {
  test("detects GitHub PR URLs", () => {
    expect(detectPrRefs("See https://github.com/foo/bar/pull/123 for details")).toEqual([
      "https://github.com/foo/bar/pull/123",
    ]);
  });

  test("detects explicitly opened PRs by number", () => {
    expect(detectPrRefs("I opened PR #42 with the fix")).toEqual(["42"]);
    expect(detectPrRefs("Created pull request 7.")).toEqual(["7"]);
  });

  test("ignores incidental PR mentions", () => {
    // Regression: "fixed in PR #42" used to trigger the watcher offer.
    expect(detectPrRefs("This was fixed in PR #42 last week")).toEqual([]);
    expect(detectPrRefs("see PR #9 for context")).toEqual([]);
  });
});

describe("offerPrWatcher", () => {
  const output = "Opened PR #12 for the fix";

  test("does nothing in headless runs", async () => {
    // Regression: !hasUI used to auto-queue a watcher without confirmation.
    const sent: string[] = [];
    const pi = { sendUserMessage: (text: string) => void sent.push(text) };
    await offerPrWatcher(pi as never, { hasUI: false }, output, "run_subagent");
    expect(sent).toEqual([]);
  });

  test("asks for confirmation and honors a decline", async () => {
    const sent: string[] = [];
    const pi = { sendUserMessage: (text: string) => void sent.push(text) };
    const ctx = { hasUI: true, ui: { confirm: async () => false } };
    await offerPrWatcher(pi as never, ctx, output, "run_subagent");
    expect(sent).toEqual([]);
  });

  test("queues the watcher after confirmation", async () => {
    const sent: string[] = [];
    const pi = { sendUserMessage: (text: string) => void sent.push(text) };
    const ctx = { hasUI: true, ui: { confirm: async () => true } };
    await offerPrWatcher(pi as never, ctx, output, "run_subagent");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("watch_agent for PR 12");
  });
});
