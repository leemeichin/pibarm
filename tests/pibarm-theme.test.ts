import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type ThemeJson = {
  name: string;
  vars: Record<string, string>;
  colors: Record<string, string>;
  export?: Record<string, string>;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function loadTheme(file: string): ThemeJson {
  return JSON.parse(readFileSync(join(import.meta.dir, "..", ".pi", "themes", file), "utf8"));
}

function loadBuiltin(name: string): ThemeJson {
  // The package's exports map hides dist internals from require.resolve.
  const path = join(
    import.meta.dir,
    "..",
    "node_modules",
    "@earendil-works",
    "pi-coding-agent",
    "dist",
    "modes",
    "interactive",
    "theme",
    `${name}.json`,
  );
  return JSON.parse(readFileSync(path, "utf8"));
}

const themes = [
  { file: "pibarm-dark.json", name: "pibarm-dark" },
  { file: "pibarm-light.json", name: "pibarm-light" },
];

describe.each(themes)("$name theme", ({ file, name }) => {
  const theme = loadTheme(file);
  const builtin = loadBuiltin("dark");

  test("declares its name for /theme discovery", () => {
    expect(theme.name).toBe(name);
  });

  test("covers exactly the colour slots pi's built-in themes define", () => {
    // pi rejects themes with missing required colour tokens; drifting extras
    // would silently do nothing. Keep parity with the shipped schema.
    expect(Object.keys(theme.colors).sort()).toEqual(Object.keys(builtin.colors).sort());
  });

  test("every colour resolves to a var or literal hex value", () => {
    for (const [slot, value] of Object.entries(theme.colors)) {
      const resolved = theme.vars[value] ?? value;
      expect(HEX.test(resolved), `${slot}: ${value} -> ${resolved}`).toBe(true);
    }
    for (const [key, value] of Object.entries(theme.vars)) {
      expect(HEX.test(value), `vars.${key}: ${value}`).toBe(true);
    }
  });
});

test("project settings auto-switch between visibly distinct pibarm themes", () => {
  const settings = JSON.parse(readFileSync(join(import.meta.dir, "..", ".pi", "settings.json"), "utf8"));
  const dark = loadTheme("pibarm-dark.json");
  const light = loadTheme("pibarm-light.json");

  expect(settings.theme).toBe("pibarm-light/pibarm-dark");
  expect(dark.vars[dark.colors.text]!).not.toBe(light.vars[light.colors.text]!);
  expect(light.vars[light.colors.border]!).toBe("#DCCFC1");
});
