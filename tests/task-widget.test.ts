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
    const lines = renderTaskPills(todos, [agent("matrix scout")], 200);
    expect(lines.join(" ")).toContain("+5 more");
  });
});
