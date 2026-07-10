import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export type TodoItem = { text: string; done: boolean };
export type AgentTaskStatus = "running" | "done" | "failed";
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
    lines.push(...todos.map((todo, i) => `  ${todo.done ? "󰄲" : "󰄱"} ${i + 1}. ${todo.text}`));
  }
  if (agents.length) {
    lines.push("Agents:");
    lines.push(...agents.map((task) => `  ${statusIcon(task.status)} ${task.label}${task.session ? ` @ ${task.session}` : ""}${task.detail ? ` (${task.detail})` : ""}`));
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
  ctx.ui.setWidget("pibarm-tasks", renderTaskPills(todos, agents), { placement: "belowEditor" });
}

function renderTaskPills(items: TodoItem[], agents: AgentTask[]) {
  const allPills = [
    ...items.map((todo, index) => `${todo.done ? "󰄲" : "󰄱"}${index + 1} ${shorten(todo.text, 34)}`),
    ...agents.map((task) => `${statusIcon(task.status)} ${shorten(task.label, 24)}${task.session ? `@${shorten(task.session, 18)}` : ""}${task.detail ? ` ${shorten(task.detail, 16)}` : ""}`),
  ].map((text) => `[${text}]`);
  const maxPills = 10;
  const visible = allPills.slice(0, maxPills);
  const hidden = allPills.length - visible.length;
  const pills = hidden > 0 ? [...visible, `[󰁕 ${hidden} more]`] : visible;

  const lines: string[] = [];
  let line = "";
  for (const pill of pills) {
    if (line && line.length + pill.length + 1 > 120) {
      lines.push(line);
      line = pill;
    } else {
      line = line ? `${line} ${pill}` : pill;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function statusIcon(status: AgentTaskStatus) {
  if (status === "running") return "󰔟";
  if (status === "failed") return "󰅖";
  return "󰄲";
}

function shorten(text: string, max: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, Math.max(1, max - 1))}…`;
}
