import { describe, expect, test } from "bun:test";
import { cooldownMs, sanitizeOscField } from "../extensions/waiting-notify.js";

describe("sanitizeOscField", () => {
  test("strips OSC field separators and control bytes", () => {
    // Regression: a ";" in question text shifted the notify;title;body fields.
    expect(sanitizeOscField("choose; then continue")).toBe("choose  then continue");
    expect(sanitizeOscField("bad\x1b]777;notify;x;y\x07text")).toBe("bad ]777 notify x y text");
    expect(sanitizeOscField("tab\tand\nnewline")).toBe("tab and newline");
  });

  test("slices by code points so multi-byte sequences survive", () => {
    const long = "🎉".repeat(200);
    const result = sanitizeOscField(long, 180);
    expect([...result]).toHaveLength(180);
    expect(result).not.toContain("�");
  });
});

describe("cooldownMs", () => {
  test("uses the default for unset, garbage, and negative values", () => {
    // Regression: Number("abc") gave NaN and the comparison never suppressed.
    expect(cooldownMs(undefined)).toBe(60000);
    expect(cooldownMs("abc")).toBe(60000);
    expect(cooldownMs("-5")).toBe(60000);
  });

  test("honors numeric values including zero", () => {
    expect(cooldownMs("120")).toBe(120000);
    expect(cooldownMs("0")).toBe(0);
  });
});
