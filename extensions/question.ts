import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { askSignalWhenIdle } from "../lib/signal-question.js";

const OPTION = Type.Object({
  label: Type.String({ description: "Short option label shown to the user" }),
  description: Type.Optional(Type.String({ description: "Optional extra detail for the option" })),
});

const QUESTION_PARAMS = Type.Object({
  question: Type.String({ description: "The question to ask the user" }),
  options: Type.Optional(Type.Array(OPTION, { description: "Optional choices for the user to pick from" })),
  allowCustom: Type.Optional(Type.Boolean({ description: "Allow the user to type a custom answer. Defaults to true." })),
});

function signalPrompt(question: string, options: Array<{ label: string; description?: string }>): string {
  const choices = options.length ? `\n\nOptions:\n${options.map((o, i) => `${i + 1}. ${o.label}${o.description ? ` — ${o.description}` : ""}`).join("\n")}` : "";
  return `Pi question:\n${question}${choices}`;
}

function optionAnswer(answer: string, options: Array<{ label: string }>): { answer: string; index?: number } {
  const number = /^\d+$/.test(answer) ? Number(answer) : 0;
  if (number >= 1 && number <= options.length) return { answer: options[number - 1].label, index: number };
  const index = options.findIndex((option) => option.label.toLowerCase() === answer.toLowerCase());
  return index >= 0 ? { answer: options[index].label, index: index + 1 } : { answer };
}

export default function questionExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "question",
    label: "Question",
    description: "Ask the user one focused question, optionally with choices, and return their answer.",
    promptSnippet: "Ask the user a single focused question with optional choices",
    promptGuidelines: [
      "Use question when one specific user decision or preference is needed before continuing.",
      "Use elicit_plan_questions instead when multiple planning questions are needed at once.",
    ],
    parameters: QUESTION_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const options = params.options ?? [];
      const allowCustom = params.allowCustom !== false;

      const signalAnswer = await askSignalWhenIdle(pi, signalPrompt(params.question, options)).catch(() => undefined);
      if (signalAnswer) {
        const selected = optionAnswer(signalAnswer, options);
        return {
          content: [{ type: "text", text: `User answered via Signal: ${selected.answer}` }],
          details: { question: params.question, options, answer: selected.answer, wasCustom: selected.index === undefined, index: selected.index },
        };
      }

      if (!ctx.hasUI) {
        const choices = options.length ? `\nOptions:\n${options.map((o, i) => `${i + 1}. ${o.label}${o.description ? ` — ${o.description}` : ""}`).join("\n")}` : "";
        return {
          content: [{ type: "text", text: `Question requires user input in interactive mode:\n${params.question}${choices}` }],
          details: { question: params.question, options, answer: null },
          isError: true,
        };
      }

      if (options.length > 0) {
        const labels = options.map((option) => option.description ? `${option.label} — ${option.description}` : option.label);
        const customLabel = "Type a custom answer";
        const choice = await ctx.ui.select(params.question, allowCustom ? [...labels, customLabel] : labels);
        if (!choice) {
          return {
            content: [{ type: "text", text: "User cancelled the question." }],
            details: { question: params.question, options, answer: null },
          };
        }
        if (choice === customLabel) {
          const answer = await ctx.ui.input(params.question, "");
          return {
            content: [{ type: "text", text: answer?.trim() ? `User answered: ${answer.trim()}` : "User provided no answer." }],
            details: { question: params.question, options, answer: answer?.trim() || null, wasCustom: true },
          };
        }
        const index = labels.indexOf(choice);
        const selected = options[index]?.label ?? choice;
        return {
          content: [{ type: "text", text: `User selected: ${selected}` }],
          details: { question: params.question, options, answer: selected, wasCustom: false, index: index + 1 },
        };
      }

      const answer = await ctx.ui.input(params.question, "");
      return {
        content: [{ type: "text", text: answer?.trim() ? `User answered: ${answer.trim()}` : "User provided no answer." }],
        details: { question: params.question, options, answer: answer?.trim() || null, wasCustom: true },
      };
    },
  });
}
