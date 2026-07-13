import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export type TodoItem = { text: string; done: boolean };
export type AgentTaskStatus = "running" | "done" | "failed";

// Pill tones follow the design system's terminal-native TaskPill form:
// subtle guillemets/separators and metadata, muted todo marks, mustard running,
// pea done, tomato failed, plain text labels, orange for the agent kind slot.
type PillTone = "dim" | "muted" | "success" | "warning" | "error" | "text" | "accent" | "border";
type PillTheme = { name?: string; fg(tone: PillTone, text: string): string };
const PLAIN_THEME: PillTheme = { fg: (_tone, text) => text };
const STATUS_TONE: Record<AgentTaskStatus, PillTone> = { running: "warning", done: "success", failed: "error" };
export type AgentTask = {
  id: string;
  label: string;
  status: AgentTaskStatus;
  session?: string;
  detail?: string;
};

let todos: TodoItem[] = [];
const agentTasks = new Map<string, AgentTask>();

export function getTodos() {
  return todos;
}

export function setTodos(items: string[]) {
  todos = items.map((text) => ({ text, done: false }));
}

export function restoreTodos(items: TodoItem[]) {
  todos = items.map((item) => ({ text: String(item.text), done: item.done === true }));
}

export function addTodos(items: string[]) {
  todos.push(...items.map((text) => ({ text, done: false })));
}

export function markTodoDone(index: number) {
  if (todos[index - 1]) todos[index - 1].done = true;
}

export function clearTodos() {
  todos = [];
}

export function todoLines() {
  return todos.map((todo, i) => `${todo.done ? "✓" : "○"} ${i + 1}. ${todo.text}`);
}

export function todoSummary() {
  const done = todos.filter((todo) => todo.done).length;
  return `todo ${done}/${todos.length}`;
}

export function upsertAgentTask(task: AgentTask) {
  agentTasks.set(task.id, task);
}

export function finishAgentTask(id: string, status: Exclude<AgentTaskStatus, "running">, detail?: string) {
  const current = agentTasks.get(id);
  if (!current) return;
  agentTasks.set(id, { ...current, status, detail: detail ?? current.detail });
}

export function removeAgentTask(id: string) {
  agentTasks.delete(id);
}

export function clearAgentTasks() {
  agentTasks.clear();
}

export function taskSummaryLines() {
  const agents = Array.from(agentTasks.values());
  const lines = [];
  if (todos.length) {
    lines.push("Todos:");
    lines.push(...todos.map((todo, i) => `  ${todo.done ? "✓" : "○"} ${i + 1}. ${todo.text}`));
  }
  if (agents.length) {
    lines.push("Agents:");
    lines.push(
      ...agents.map(
        (task) =>
          `  ${statusIcon(task.status)} ${task.label}${task.session ? ` @ ${task.session}` : ""}${task.detail ? ` (${task.detail})` : ""}`,
      ),
    );
  }
  return lines;
}

export function updateTaskWidget(ctx: ExtensionContext) {
  const agents = Array.from(agentTasks.values());
  if (!todos.length && !agents.length) {
    ctx.ui.setStatus("todos", undefined);
    ctx.ui.setStatus("pibarm-tasks", undefined);
    ctx.ui.setWidget("todos", undefined);
    ctx.ui.setWidget("pibarm-tasks", undefined);
    return;
  }

  const doneTodos = todos.filter((todo) => todo.done).length;
  const runningAgents = agents.filter((task) => task.status === "running").length;
  const failedAgents = agents.filter((task) => task.status === "failed").length;
  const statusParts = [];
  if (todos.length) statusParts.push(`todo ${doneTodos}/${todos.length}`);
  if (runningAgents) statusParts.push(`agents ${runningAgents}`);
  if (failedAgents) statusParts.push(`failed ${failedAgents}`);
  ctx.ui.setStatus("todos", undefined);
  ctx.ui.setStatus("pibarm-tasks", statusParts.join(" · "));
  ctx.ui.setWidget("todos", undefined);
  if (ctx.mode === "tui") {
    // Component form: render receives the real viewport width, so pills wrap
    // correctly on narrow terminals instead of at a hardcoded column count.
    ctx.ui.setWidget(
      "pibarm-tasks",
      (_tui, theme) => ({
        render: (width: number) => renderTaskPills(getTodos(), Array.from(agentTasks.values()), width, theme),
        invalidate: () => {},
      }),
      { placement: "belowEditor" },
    );
  } else {
    ctx.ui.setWidget("pibarm-tasks", renderTaskPills(todos, agents, 80), { placement: "belowEditor" });
  }
}

export function renderTaskPills(items: TodoItem[], agents: AgentTask[], width: number, theme: PillTheme = PLAIN_THEME) {
  const light = theme.name === "pibarm-light";
  const chromeTone: PillTone = light ? "border" : "dim";
  const metaTone: PillTone = light ? "dim" : "muted";
  const sep = ` ${theme.fg(chromeTone, "·")} `;
  const allPills = [
    ...items.map((todo, index) =>
      pill(
        `${theme.fg(todo.done ? "success" : "muted", todo.done ? "✓" : "○")} ${theme.fg(metaTone, `${index + 1}`)}${sep}${theme.fg("text", shorten(todo.text, 34))}`,
        theme,
        chromeTone,
      ),
    ),
    ...agents.map((task) =>
      pill(
        `${theme.fg(STATUS_TONE[task.status], statusIcon(task.status))} ${agentLabel(task.label, theme)}${task.session ? `${sep}${theme.fg(metaTone, shorten(task.session, 18))}` : ""}${task.detail ? `${sep}${theme.fg(metaTone, shorten(task.detail, 16))}` : ""}`,
        theme,
        chromeTone,
      ),
    ),
  ];
  const maxPills = 10;
  const visible = allPills.slice(0, maxPills);
  const hidden = allPills.length - visible.length;
  const pills = hidden > 0 ? [...visible, pill(theme.fg(metaTone, `+${hidden} more`), theme, chromeTone)] : visible;

  const maxWidth = Math.max(12, width);
  const lines: string[] = [];
  let line = "";
  for (const nextPill of pills) {
    const candidate = line ? `${line} ${nextPill}` : nextPill;
    if (line && visibleWidth(candidate) > maxWidth) {
      lines.push(line);
      line = visibleWidth(nextPill) > maxWidth ? truncateToWidth(nextPill, maxWidth) : nextPill;
    } else {
      line = visibleWidth(candidate) > maxWidth ? truncateToWidth(candidate, maxWidth) : candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function pill(text: string, theme: PillTheme = PLAIN_THEME, chromeTone: PillTone = "dim") {
  return `${theme.fg(chromeTone, "‹")} ${text} ${theme.fg(chromeTone, "›")}`;
}

function agentLabel(label: string, theme: PillTheme) {
  const [kind, ...rest] = shorten(label, 24).split(" ");
  return `${theme.fg("accent", kind ?? "")}${rest.length ? ` ${theme.fg("text", rest.join(" "))}` : ""}`;
}

function statusIcon(status: AgentTaskStatus) {
  if (status === "running") return "●";
  if (status === "failed") return "!";
  return "✓";
}

function shorten(text: string, max: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  // Measure display columns (CJK/emoji are double width) and truncate on
  // grapheme boundaries instead of slicing through surrogate pairs.
  if (visibleWidth(normalized) <= max) return normalized;
  return `${truncateToWidth(normalized, Math.max(1, max - 1))}…`;
}
