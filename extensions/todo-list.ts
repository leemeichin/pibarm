import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  addTodos,
  clearAgentTasks,
  clearTodos,
  getTodos,
  markTodoDone,
  restoreTodos,
  setTodos,
  taskSummaryLines,
  todoLines,
  todoSummary,
  updateTaskWidget,
  type TodoItem,
} from "../lib/task-widget.js";

const TODO_PARAMS = Type.Object({
  action: StringEnum(["set", "add", "done", "list", "clear"] as const),
  items: Type.Optional(Type.Array(Type.String(), { description: "Todo items for action=set or action=add" })),
  index: Type.Optional(Type.Number({ description: "1-based todo index for action=done" })),
});

function looksMultiAsk(prompt: string): boolean {
  const taskLines = prompt.split("\n").filter((line) => /^\s*(?:[-*]|\d+[.)])\s+\S/.test(line));
  if (taskLines.length >= 2) return true;
  return (
    /\b(and then|also|after that)\b/i.test(prompt) &&
    /\b(add|fix|update|change|implement|test|commit|push|check)\b/i.test(prompt)
  );
}

export default function todoListExtension(pi: ExtensionAPI) {
  pi.registerCommand("tasks", {
    description: "Show all todo and delegated agent tasks from the shared task widget",
    handler: async (_args, ctx) => {
      const lines = taskSummaryLines();
      ctx.ui.notify(lines.length ? lines.join("\n") : "No active task widget items.", "info");
    },
  });

  pi.registerTool({
    name: "todo_list",
    label: "Todo List",
    description: "Track a short todo list for prompts with multiple requested tasks.",
    promptSnippet: "Track progress through multiple requested tasks",
    promptGuidelines: [
      "Use todo_list when the user asks for multiple tasks in one prompt: set the list before starting, mark items done as they complete, and keep it short. The shared task widget updates in place with horizontal todo/agent pills; do not repeat the list in prose unless the user asks.",
    ],
    parameters: TODO_PARAMS,
    async execute(_id, params, _signal, _update, ctx) {
      if (params.action === "set") setTodos(params.items ?? []);
      if (params.action === "add") addTodos(params.items ?? []);
      if (params.action === "done" && params.index) markTodoDone(params.index);
      if (params.action === "clear") {
        clearTodos();
        clearAgentTasks();
      }
      updateTaskWidget(ctx);
      const todos = getTodos();
      const text =
        params.action === "list"
          ? todos.length
            ? todoLines().join("\n")
            : "No todos."
          : todos.length
            ? `Todo updated: ${todoSummary()}`
            : "Todos cleared.";
      return { content: [{ type: "text", text }], details: { todos } };
    },
  });

  pi.on("before_agent_start", (event) => {
    if (!looksMultiAsk(event.prompt)) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\nWhen the user asks for multiple tasks in one prompt, call todo_list(action=set) with a short checklist before starting and todo_list(action=done) as each item completes. The shared task widget updates in place with horizontal todo/agent pills; don't repeat the list in your normal response unless asked.`,
    };
  });

  pi.on("session_start", (_event, ctx) => {
    // Module state outlives /new, /resume, and branch switches; rebuild the
    // widget from the active session branch instead of showing stale todos.
    clearTodos();
    clearAgentTasks();
    const restored = latestTodoSnapshot(ctx);
    if (restored) restoreTodos(restored);
    updateTaskWidget(ctx);
  });
}

function latestTodoSnapshot(ctx: ExtensionContext): TodoItem[] | undefined {
  const entries = ctx.sessionManager.getBranch();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i] as {
      type: string;
      message?: { role?: string; toolName?: string; details?: { todos?: unknown } };
    };
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (message?.role !== "toolResult" || message.toolName !== "todo_list") continue;
    const todos = message.details?.todos;
    if (Array.isArray(todos)) {
      return todos.filter((item): item is TodoItem => Boolean(item) && typeof (item as TodoItem).text === "string");
    }
  }
  return undefined;
}
