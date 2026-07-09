import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const TODO_PARAMS = Type.Object({
  action: StringEnum(["set", "add", "done", "list", "clear"] as const),
  items: Type.Optional(Type.Array(Type.String(), { description: "Todo items for action=set or action=add" })),
  index: Type.Optional(Type.Number({ description: "1-based todo index for action=done" })),
});

type Todo = { text: string; done: boolean };

function looksMultiAsk(prompt: string): boolean {
  const taskLines = prompt.split("\n").filter((line) => /^\s*(?:[-*]|\d+[.)])\s+\S/.test(line));
  if (taskLines.length >= 2) return true;
  return /\b(and then|also|after that)\b/i.test(prompt) && /\b(add|fix|update|change|implement|test|commit|push|check)\b/i.test(prompt);
}

function render(todos: Todo[]) {
  return todos.length
    ? todos.map((todo, i) => `${todo.done ? "✓" : "○"} ${i + 1}. ${todo.text}`).join("\n")
    : "No todos.";
}

function updateStatus(ctx: ExtensionContext, todos: Todo[]) {
  if (!todos.length) {
    ctx.ui.setStatus("todos", undefined);
    return;
  }
  const done = todos.filter((todo) => todo.done).length;
  ctx.ui.setStatus("todos", `todo ${done}/${todos.length}`);
}

export default function todoListExtension(pi: ExtensionAPI) {
  let todos: Todo[] = [];

  pi.registerTool({
    name: "todo_list",
    label: "Todo List",
    description: "Track a short todo list for prompts with multiple requested tasks.",
    promptSnippet: "Track progress through multiple requested tasks",
    promptGuidelines: [
      "Use todo_list when the user asks for multiple tasks in one prompt: set the list before starting, mark items done as they complete, and keep it short.",
    ],
    parameters: TODO_PARAMS,
    async execute(_id, params, _signal, _update, ctx) {
      if (params.action === "set") todos = (params.items ?? []).map((text) => ({ text, done: false }));
      if (params.action === "add") todos.push(...(params.items ?? []).map((text) => ({ text, done: false })));
      if (params.action === "done" && params.index && todos[params.index - 1]) todos[params.index - 1].done = true;
      if (params.action === "clear") todos = [];
      updateStatus(ctx, todos);
      return { content: [{ type: "text", text: render(todos) }], details: { todos } };
    },
  });

  pi.on("before_agent_start", (event) => {
    if (!looksMultiAsk(event.prompt)) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\nWhen the user asks for multiple tasks in one prompt, call todo_list(action=set) with a short checklist before starting and todo_list(action=done) as each item completes.`,
    };
  });

  pi.on("session_start", (_event, ctx) => updateStatus(ctx, todos));
}
