import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { renderTaskPills, type AgentTask, type TodoItem } from "../lib/task-widget.js";

const todo = (text: string, done = false): TodoItem => ({ text, done });
const agent = (label: string): AgentTask => ({ id: label, label, status: "running" });

describe("renderTaskPills", () => {
  test("wraps at the given width instead of a hardcoded 120 columns", () => {
    const todos = [todo("inspect the auth flow"), todo("write the failing test"), todo("fix and refactor")];
    const narrow = renderTaskPills(todos, [], 40);
    for (const line of narrow) expect(visibleWidth(line)).toBeLessThanOrEqual(40);
    expect(narrow.length).toBeGreaterThan(1);

    const wide = renderTaskPills(todos, [], 200);
    expect(wide).toHaveLength(1);
  });

  test("measures display width, not string length, for wide glyphs", () => {
    // "部署完了" is 4 chars but 8 columns; length-based wrapping overflows.
    const todos = [todo("部署完了部署完了部署完了"), todo("部署完了部署完了部署完了")];
    for (const line of renderTaskPills(todos, [], 30)) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(30);
    }
  });

  test("does not split surrogate pairs when shortening", () => {
    const todos = [todo("🎉".repeat(50))];
    for (const line of renderTaskPills(todos, [], 40)) {
      // A broken surrogate pair would render as the replacement character.
      expect(line).not.toContain("�");
      expect(visibleWidth(line)).toBeLessThanOrEqual(40);
    }
  });

  test("caps the number of pills with a +N more indicator", () => {
    const todos = Array.from({ length: 14 }, (_, i) => todo(`task ${i + 1}`));
    const lines = renderTaskPills(todos, [agent("butty scout")], 200);
    expect(lines.join(" ")).toContain("+5 more");
  });

  test("applies design-system tones through the theme without breaking wrapping", () => {
    const tones: string[] = [];
    const theme = {
      fg(tone: string, text: string) {
        tones.push(tone);
        return `\x1b[31m${text}\x1b[0m`;
      },
    };
    const todos = [todo("inspect the auth flow"), todo("write the failing test", true)];
    const agents: AgentTask[] = [
      { id: "a", label: "butty scout", status: "running", session: "wt-scout" },
      { id: "b", label: "planner", status: "failed" },
    ];
    const lines = renderTaskPills(todos, agents, 48, theme);
    for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(48);

    // TaskPill term form: dim guillemets, muted todo marks, pea done,
    // mustard running, tomato failed, plain-text labels, muted metadata.
    expect(tones).toContain("dim");
    expect(tones).toContain("muted");
    expect(tones).toContain("success");
    expect(tones).toContain("warning");
    expect(tones).toContain("error");
    expect(tones).toContain("text");
    expect(tones).toContain("accent");
  });

  test("uses the website's lighter chrome and warm metadata hierarchy in light mode", () => {
    const styled: Array<[string, string]> = [];
    const theme = {
      name: "pibarm-light",
      fg(tone: string, text: string) {
        styled.push([tone, text]);
        return text;
      },
    };

    renderTaskPills([todo("inspect auth")], [{ ...agent("butty scout"), session: "butty-pibarm" }], 80, theme);

    expect(styled).toContainEqual(["border", "‹"]);
    expect(styled).toContainEqual(["dim", "1"]);
    expect(styled).toContainEqual(["accent", "butty"]);
    expect(styled).toContainEqual(["text", "scout"]);
    expect(styled).toContainEqual(["dim", "butty-pibarm"]);
  });

  test("renders plain text when no theme is given", () => {
    const lines = renderTaskPills([todo("plain task")], [], 80);
    expect(lines.join("")).not.toContain("\x1b[");
  });
});
