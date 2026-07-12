import { describe, expect, test } from "bun:test";
import { tokenizeArgs } from "../extensions/mcporter.js";

describe("tokenizeArgs", () => {
  test("splits plain arguments on whitespace", () => {
    expect(tokenizeArgs("list linear --json")).toEqual(["list", "linear", "--json"]);
  });

  test("keeps quoted arguments with spaces intact", () => {
    expect(tokenizeArgs(`call linear.search --args '{"q": "two words"}'`)).toEqual([
      "call",
      "linear.search",
      "--args",
      '{"q": "two words"}',
    ]);
  });

  test("handles double quotes and attached quoting", () => {
    expect(tokenizeArgs(`--args="two words"`)).toEqual(["--args=two words"]);
    expect(tokenizeArgs(`resource "my server"`)).toEqual(["resource", "my server"]);
  });

  test("preserves empty quoted tokens and trims stray whitespace", () => {
    expect(tokenizeArgs(`  a  ''  b `)).toEqual(["a", "", "b"]);
    expect(tokenizeArgs("")).toEqual([]);
  });
});
