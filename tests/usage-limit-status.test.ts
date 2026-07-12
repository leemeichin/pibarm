import { describe, expect, test } from "bun:test";
import { parseReset, parseResetValue } from "../extensions/usage-limit-status.js";

describe("parseResetValue", () => {
  test("parses epoch seconds and milliseconds", () => {
    const seconds = Math.floor(Date.now() / 1000) + 60;
    expect(parseResetValue(String(seconds))?.getTime()).toBe(seconds * 1000);
    const millis = Date.now() + 60000;
    expect(parseResetValue(String(millis))?.getTime()).toBe(millis);
  });

  test("parses golang-style durations", () => {
    const before = Date.now();
    const parsed = parseResetValue("6m0s");
    expect(parsed).toBeDefined();
    expect(parsed!.getTime() - before).toBeGreaterThanOrEqual(6 * 60000 - 50);
    expect(parsed!.getTime() - before).toBeLessThanOrEqual(6 * 60000 + 1000);
    expect(parseResetValue("30s")).toBeDefined();
    expect(parseResetValue("1h2m")).toBeDefined();
  });

  test("parses RFC dates and rejects garbage", () => {
    expect(parseResetValue("2030-01-01T00:00:00Z")?.getFullYear()).toBe(2030);
    expect(parseResetValue("not-a-date")).toBeUndefined();
    expect(parseResetValue("")).toBeUndefined();
  });
});

describe("parseReset", () => {
  test("prefers retry-after seconds", () => {
    const before = Date.now();
    const parsed = parseReset({ "retry-after": "30" });
    expect(parsed!.getTime() - before).toBeGreaterThanOrEqual(29000);
  });

  test("handles OpenAI-style x-ratelimit-reset values", () => {
    // Regression: new Date("6m0s") and new Date("1760000000") are both
    // Invalid Date, which left the footer warning stuck forever.
    expect(parseReset({ "x-ratelimit-reset": "6m0s" })).toBeDefined();
    expect(parseReset({ "x-ratelimit-reset": "1760000000" })).toBeDefined();
  });

  test("returns undefined when nothing is parseable", () => {
    expect(parseReset({ "x-ratelimit-reset": "soon" })).toBeUndefined();
    expect(parseReset({})).toBeUndefined();
  });
});
