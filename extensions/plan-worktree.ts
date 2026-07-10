import { mkdir } from "node:fs/promises";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { join } from "node:path";
import { selectAgentModelRef } from "../lib/current-model.js";
import { finishAgentTask, upsertAgentTask, updateTaskWidget } from "../lib/task-widget.js";

const READ_ONLY_TOOLS = ["read", "bash", "grep", "find", "ls", "mcporter_list", "mcporter_resource", "question", "elicit_plan_questions", "create_git_worktree"];
const WRITE_TOOLS = new Set(["edit", "write"]);

const PLAN_OPTION = Type.Union([
  Type.String(),
  Type.Object({
    label: Type.String({ description: "Option label shown to the user" }),
    value: Type.Optional(Type.Unknown({ description: "Optional machine-readable value returned in details" })),
    description: Type.Optional(Type.String({ description: "Optional detail shown under the option" })),
    preview: Type.Optional(Type.String({ description: "Optional preview shown when this option is highlighted" })),
  }),
]);

const PLAN_QUESTION = Type.Object({
  id: Type.Optional(Type.String({ description: "Stable answer id" })),
  label: Type.Optional(Type.String({ description: "Short tab label" })),
  question: Type.Optional(Type.String({ description: "Question text" })),
  prompt: Type.Optional(Type.String({ description: "Alias for question" })),
  type: Type.Optional(Type.Union([
    Type.Literal("text"),
    Type.Literal("free_text"),
    Type.Literal("select"),
    Type.Literal("select_one"),
    Type.Literal("multi"),
    Type.Literal("select_many"),
    Type.Literal("confirm"),
    Type.Literal("bool"),
    Type.Literal("boolean"),
    Type.Literal("number"),
  ], { description: "Input type. Defaults to free_text." })),
  options: Type.Optional(Type.Array(PLAN_OPTION, { description: "Options for select/select_many/confirm inputs" })),
  default: Type.Optional(Type.Unknown({ description: "Default answer/value" })),
  min: Type.Optional(Type.Number({ description: "Minimum number value" })),
  max: Type.Optional(Type.Number({ description: "Maximum number value" })),
  placeholder: Type.Optional(Type.String({ description: "Placeholder/help text for text inputs" })),
  preview: Type.Optional(Type.String({ description: "Preview of the intended action or consequences" })),
  actionPreview: Type.Optional(Type.String({ description: "Alias for preview" })),
  notes: Type.Optional(Type.Boolean({ description: "Enable per-question notes. Defaults to true." })),
  allowCustom: Type.Optional(Type.Boolean({ description: "Allow custom text for select_one/select_many. Defaults to false." })),
});

const ELICIT_PARAMS = Type.Object({
  questions: Type.Array(Type.Union([Type.String(), PLAN_QUESTION]), { description: "Specific questions to ask before finalizing or executing a plan. Strings become free_text questions; objects may request select_one/select_many/confirm/boolean/number/free_text." }),
  context: Type.Optional(Type.String({ description: "Short context explaining why these answers are needed" })),
  edit: Type.Optional(Type.Boolean({ description: "Use a rich tabbed multi-question UI when available. Defaults to true." })),
});

type PlanQuestionType = "free_text" | "select_one" | "select_many" | "confirm" | "boolean" | "number";

interface PlanOption {
  label: string;
  value: unknown;
  description?: string;
  preview?: string;
  custom?: boolean;
}

interface PlanQuestion {
  id: string;
  label: string;
  question: string;
  type: PlanQuestionType;
  options: PlanOption[];
  default?: unknown;
  min?: number;
  max?: number;
  placeholder?: string;
  preview?: string;
  notes: boolean;
  allowCustom: boolean;
}

interface RichPlanAnswer {
  id: string;
  question: string;
  answer: string;
  value: unknown;
  notes?: string;
  wasCustom?: boolean;
  index?: number;
}

interface PlanAnswerState {
  answer: string;
  value: unknown;
  notes: string;
  selected: number[];
  wasCustom?: boolean;
  index?: number;
}

const NF = {
  border: "─",
  empty: "󰄱",
  done: "󰄲",
  dot: "󰄮",
  text: "󰦨",
  select: "󰕣",
  multi: "󰄲",
  confirm: "󰔡",
  number: "󰎠",
  note: "󰎚",
  preview: "󰈙",
  submit: "󰄬",
  cursor: "",
};

function normalizeQuestionType(type: unknown, options: PlanOption[]): PlanQuestionType {
  switch (type) {
    case "select": return "select_one";
    case "multi": return "select_many";
    case "bool": return "boolean";
    case "text": return "free_text";
    case "free_text":
    case "select_one":
    case "select_many":
    case "confirm":
    case "boolean":
    case "number":
      return type;
    default:
      return options.length > 0 ? "select_one" : "free_text";
  }
}

function normalizePlanOption(option: unknown): PlanOption {
  if (typeof option === "string") return { label: option, value: option };
  const raw = option as { label?: unknown; value?: unknown; description?: unknown; preview?: unknown };
  const label = String(raw.label ?? raw.value ?? "Option");
  return {
    label,
    value: raw.value ?? label,
    description: typeof raw.description === "string" ? raw.description : undefined,
    preview: typeof raw.preview === "string" ? raw.preview : undefined,
  };
}

function normalizePlanQuestions(input: Array<string | Record<string, unknown>>): PlanQuestion[] {
  return input.map((item, index) => {
    if (typeof item === "string") {
      return {
        id: `q${index + 1}`,
        label: `Q${index + 1}`,
        question: item,
        type: "free_text",
        options: [],
        notes: true,
        allowCustom: false,
      };
    }
    const raw = item;
    const options = Array.isArray(raw.options) ? raw.options.map(normalizePlanOption) : [];
    const type = normalizeQuestionType(raw.type, options);
    const question = String(raw.question ?? raw.prompt ?? raw.label ?? `Question ${index + 1}`);
    const defaultOptions = type === "confirm" || type === "boolean"
      ? (options.length ? options : [{ label: "Yes", value: true }, { label: "No", value: false }])
      : options;
    return {
      id: String(raw.id ?? `q${index + 1}`),
      label: String(raw.label ?? `Q${index + 1}`),
      question,
      type,
      options: defaultOptions,
      default: raw.default,
      min: typeof raw.min === "number" ? raw.min : undefined,
      max: typeof raw.max === "number" ? raw.max : undefined,
      placeholder: typeof raw.placeholder === "string" ? raw.placeholder : undefined,
      preview: typeof raw.preview === "string" ? raw.preview : typeof raw.actionPreview === "string" ? raw.actionPreview : undefined,
      notes: raw.notes !== false,
      allowCustom: raw.allowCustom === true,
    };
  });
}

function initialAnswer(question: PlanQuestion): PlanAnswerState {
  const state: PlanAnswerState = { answer: "", value: "", notes: "", selected: [] };
  if (question.default === undefined) return state;
  if (question.type === "select_many" && Array.isArray(question.default)) {
    const defaults = question.default;
    state.selected = question.options.flatMap((option, index) => defaults.includes(option.value) || defaults.includes(option.label) ? [index] : []);
    state.answer = state.selected.map((i) => question.options[i]?.label).filter(Boolean).join(", ");
    state.value = state.selected.map((i) => question.options[i]?.value);
    return state;
  }
  const selectedIndex = question.options.findIndex((option) => option.value === question.default || option.label === question.default);
  if (selectedIndex >= 0) {
    const option = question.options[selectedIndex]!;
    state.selected = [selectedIndex];
    state.answer = option.label;
    state.value = option.value;
    state.index = selectedIndex + 1;
    return state;
  }
  state.answer = String(question.default);
  state.value = question.default;
  return state;
}

function parseNumberedAnswers(questions: PlanQuestion[], text: string): RichPlanAnswer[] {
  const answers = questions.map((question) => ({ id: question.id, question: question.question, answer: "", value: "" }));
  let currentIndex = -1;
  for (const line of text.split("\n")) {
    const numbered = line.match(/^\s*(\d+)[.)]?\s*(.*)$/);
    if (numbered) {
      currentIndex = Number(numbered[1]) - 1;
      const rest = numbered[2]?.trim() ?? "";
      if (answers[currentIndex] && rest && rest !== questions[currentIndex]!.question && !questions[currentIndex]!.question.startsWith(rest)) {
        answers[currentIndex]!.answer = rest.replace(/^Answer:\s*/i, "");
        answers[currentIndex]!.value = answers[currentIndex]!.answer;
      }
      continue;
    }
    const answerLine = line.match(/^\s*(?:Answer:)?\s*(.+?)\s*$/i);
    if (currentIndex >= 0 && answers[currentIndex] && answerLine?.[1] && !answers[currentIndex]!.answer) {
      answers[currentIndex]!.answer = answerLine[1].trim();
      answers[currentIndex]!.value = answers[currentIndex]!.answer;
    }
  }
  if (questions.length === 1 && !answers[0]!.answer) {
    answers[0]!.answer = text.trim();
    answers[0]!.value = answers[0]!.answer;
  }
  return answers;
}

async function askTabbedPlanQuestions(ctx: ExtensionContext, questions: PlanQuestion[], context?: string) {
  const result = await ctx.ui.custom<{ answers: RichPlanAnswer[]; cancelled: boolean }>((tui, theme, _kb, done) => {
    let current = 0;
    let optionIndex = 0;
    let noteMode = false;
    let customMode = false;
    let cached: string[] | undefined;
    const states = questions.map(initialAnswer);
    const editorTheme: EditorTheme = {
      borderColor: (s) => theme.fg("accent", s),
      selectList: {
        selectedPrefix: (t) => theme.fg("accent", t),
        selectedText: (t) => theme.fg("accent", t),
        description: (t) => theme.fg("muted", t),
        scrollInfo: (t) => theme.fg("dim", t),
        noMatch: (t) => theme.fg("warning", t),
      },
    };
    const editor = new Editor(tui, editorTheme);
    editor.setText(states[0]?.answer ?? "");

    function questionIcon(question: PlanQuestion) {
      if (question.type === "select_many") return NF.multi;
      if (question.type === "select_one") return NF.select;
      if (question.type === "confirm" || question.type === "boolean") return NF.confirm;
      if (question.type === "number") return NF.number;
      return NF.text;
    }

    function refresh() {
      cached = undefined;
      tui.requestRender();
    }

    function currentQuestion() {
      return questions[current];
    }

    function currentState() {
      return states[current];
    }

    function saveEditor() {
      const question = currentQuestion();
      const state = currentState();
      if (!question || !state) return;
      const text = editor.getText().trim();
      if (noteMode) {
        state.notes = text;
      } else if (customMode) {
        state.answer = text;
        state.value = text;
        state.wasCustom = true;
        state.index = undefined;
      } else if (question.type === "free_text") {
        state.answer = text;
        state.value = text;
      } else if (question.type === "number") {
        const value = text === "" ? undefined : Number(text);
        state.answer = text;
        state.value = Number.isFinite(value) ? value : text;
      }
    }

    function loadEditor() {
      const question = currentQuestion();
      const state = currentState();
      if (!question || !state) return;
      if (noteMode) editor.setText(state.notes);
      else if (customMode) editor.setText(state.wasCustom ? state.answer : "");
      else editor.setText(String(state.answer ?? ""));
    }

    function goto(index: number) {
      saveEditor();
      current = Math.max(0, Math.min(questions.length, index));
      optionIndex = 0;
      noteMode = false;
      customMode = false;
      if (current < questions.length) loadEditor();
      refresh();
    }

    function answerFromSelection(question: PlanQuestion, state: PlanAnswerState) {
      const selected = state.selected.map((i) => question.options[i]).filter((o): o is PlanOption => Boolean(o));
      state.answer = selected.map((option) => option.label).join(", ");
      state.value = question.type === "select_many" ? selected.map((option) => option.value) : selected[0]?.value;
      state.index = question.type === "select_many" ? undefined : state.selected[0] === undefined ? undefined : state.selected[0] + 1;
      state.wasCustom = false;
    }

    function finalAnswers(): RichPlanAnswer[] {
      saveEditor();
      return questions.map((question, index) => {
        const state = states[index]!;
        return {
          id: question.id,
          question: question.question,
          answer: state.answer,
          value: state.value,
          notes: state.notes || undefined,
          wasCustom: state.wasCustom,
          index: state.index,
        };
      });
    }

    function submit() {
      done({ answers: finalAnswers(), cancelled: false });
    }

    function advance() {
      if (current < questions.length - 1) goto(current + 1);
      else goto(questions.length);
    }

    editor.onSubmit = () => {
      saveEditor();
      if (noteMode || customMode) {
        noteMode = false;
        customMode = false;
        loadEditor();
        refresh();
        return;
      }
      advance();
    };

    function toggleNoteMode() {
      const question = currentQuestion();
      if (!question?.notes) return;
      saveEditor();
      noteMode = !noteMode;
      customMode = false;
      loadEditor();
      refresh();
    }

    function nudgeNumber(delta: number) {
      const question = currentQuestion();
      const state = currentState();
      if (!question || !state || question.type !== "number") return false;
      saveEditor();
      const base = typeof state.value === "number" && Number.isFinite(state.value) ? state.value : Number(state.answer) || 0;
      const next = Math.max(question.min ?? Number.NEGATIVE_INFINITY, Math.min(question.max ?? Number.POSITIVE_INFINITY, base + delta));
      state.answer = String(next);
      state.value = next;
      editor.setText(state.answer);
      refresh();
      return true;
    }

    function selectCurrentOption(advanceOnSelect: boolean) {
      const question = currentQuestion();
      const state = currentState();
      if (!question || !state) return;
      if (question.allowCustom && optionIndex === question.options.length) {
        saveEditor();
        customMode = true;
        noteMode = false;
        loadEditor();
        refresh();
        return;
      }
      if (!question.options[optionIndex]) return;
      if (question.type === "select_many") {
        state.selected = state.selected.includes(optionIndex)
          ? state.selected.filter((i) => i !== optionIndex)
          : [...state.selected, optionIndex].sort((a, b) => a - b);
        answerFromSelection(question, state);
        refresh();
        return;
      }
      state.selected = [optionIndex];
      answerFromSelection(question, state);
      refresh();
      if (advanceOnSelect) advance();
    }

    function handleInput(data: string) {
      if (matchesKey(data, Key.escape)) {
        if (noteMode || customMode) {
          noteMode = false;
          customMode = false;
          loadEditor();
          refresh();
          return;
        }
        return done({ answers: finalAnswers(), cancelled: true });
      }
      if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) return goto((current + 1) % (questions.length + 1));
      if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) return goto((current - 1 + questions.length + 1) % (questions.length + 1));
      if (current === questions.length) {
        if (matchesKey(data, Key.enter)) submit();
        return;
      }
      if (data === "n" || data === "N") return toggleNoteMode();
      const question = currentQuestion();
      if (!question) return;
      if (noteMode || customMode || question.type === "free_text" || question.type === "number") {
        if (question.type === "number" && !noteMode && !customMode) {
          if (matchesKey(data, Key.up)) return void nudgeNumber(1);
          if (matchesKey(data, Key.down)) return void nudgeNumber(-1);
        }
        editor.handleInput(data);
        refresh();
        return;
      }
      const optionCount = question.options.length + (question.allowCustom ? 1 : 0);
      if (matchesKey(data, Key.up)) {
        optionIndex = Math.max(0, optionIndex - 1);
        refresh();
        return;
      }
      if (matchesKey(data, Key.down)) {
        optionIndex = Math.min(Math.max(0, optionCount - 1), optionIndex + 1);
        refresh();
        return;
      }
      if (/^[1-9]$/.test(data)) {
        const index = Number(data) - 1;
        if (index >= 0 && index < optionCount) {
          optionIndex = index;
          selectCurrentOption(question.type !== "select_many");
        }
        return;
      }
      if (matchesKey(data, Key.space) && question.type === "select_many") return selectCurrentOption(false);
      if (matchesKey(data, Key.enter)) {
        if (question.type === "select_many") {
          if (states[current]!.selected.length > 0) return advance();
          return selectCurrentOption(false);
        }
        selectCurrentOption(true);
      }
    }

    function addWrapped(lines: string[], prefix: string, text: string, width: number) {
      const prefixWidth = visibleWidth(prefix);
      const wrapped = wrapTextWithAnsi(text, Math.max(1, width - prefixWidth));
      for (let i = 0; i < wrapped.length; i++) lines.push(`${i === 0 ? prefix : " ".repeat(prefixWidth)}${wrapped[i]}`);
    }

    function renderOptions(lines: string[], width: number, question: PlanQuestion, state: PlanAnswerState) {
      const options = question.allowCustom ? [...question.options, { label: "Other / custom", value: "", custom: true }] : question.options;
      options.forEach((option, index) => {
        const selected = state.selected.includes(index) || (option.custom && state.wasCustom);
        const active = index === optionIndex;
        const box = question.type === "select_many" ? (selected ? NF.done : NF.empty) : (selected ? NF.dot : " ");
        const prefix = active ? theme.fg("accent", `${NF.cursor} `) : "  ";
        const label = `${box} ${index + 1}. ${option.label}${option.custom && customMode ? " 󰏫" : ""}`;
        addWrapped(lines, prefix, theme.fg(active ? "accent" : selected ? "success" : "text", label), width);
        if (option.description) addWrapped(lines, "     ", theme.fg("muted", option.description), width);
      });
    }

    function render(width: number) {
      if (cached) return cached;
      const w = Math.max(24, width);
      const lines: string[] = [];
      lines.push(theme.fg("accent", NF.border.repeat(w)));
      const tabs = questions.map((question, i) => {
        const answered = states[i]?.answer || states[i]?.selected.length;
        const label = ` ${answered ? NF.done : NF.empty} ${question.label} `;
        return i === current ? theme.bg("selectedBg", theme.fg("text", label)) : theme.fg(answered ? "success" : "muted", label);
      });
      const submitLabel = ` ${NF.submit} Submit `;
      tabs.push(current === questions.length ? theme.bg("selectedBg", theme.fg("text", submitLabel)) : theme.fg("success", submitLabel));
      addWrapped(lines, " ", tabs.join(" "), w);
      lines.push("");
      if (context) {
        addWrapped(lines, " ", theme.fg("muted", context), w);
        lines.push("");
      }
      if (current === questions.length) {
        addWrapped(lines, " ", theme.fg("accent", theme.bold(`${NF.submit} Review answers`)), w);
        lines.push("");
        questions.forEach((question, i) => {
          const state = states[i]!;
          addWrapped(lines, " ", theme.fg("muted", `${question.label}: `) + question.question, w);
          addWrapped(lines, "   ", state.answer ? theme.fg("text", state.answer) : theme.fg("warning", "(blank)"), w);
          if (state.notes) addWrapped(lines, "   ", theme.fg("muted", `${NF.note} ${state.notes}`), w);
        });
        lines.push("");
        addWrapped(lines, " ", theme.fg("success", "Enter to submit"), w);
      } else {
        const question = currentQuestion()!;
        const state = currentState()!;
        addWrapped(lines, " ", theme.fg("accent", `${questionIcon(question)} ${question.label}  ${theme.fg("muted", `${current + 1}/${questions.length}`)}`), w);
        addWrapped(lines, " ", question.question, w);
        if (question.preview) {
          lines.push("");
          addWrapped(lines, " ", theme.fg("muted", `${NF.preview} Preview: ${question.preview}`), w);
        }
        const highlighted = question.options[optionIndex];
        if (highlighted?.preview) addWrapped(lines, " ", theme.fg("muted", `${NF.preview} Option: ${highlighted.preview}`), w);
        lines.push("");
        if (noteMode) {
          addWrapped(lines, " ", theme.fg("muted", `${NF.note} Notes:`), w);
          for (const line of editor.render(Math.max(1, w - 2))) lines.push(` ${line}`);
        } else if (customMode) {
          addWrapped(lines, " ", theme.fg("muted", "Custom answer:"), w);
          for (const line of editor.render(Math.max(1, w - 2))) lines.push(` ${line}`);
        } else if (question.type === "free_text" || question.type === "number") {
          const label = question.type === "number" ? `${NF.number} Number:` : `${NF.text} Answer:`;
          addWrapped(lines, " ", theme.fg("muted", question.placeholder ? `${label} ${question.placeholder}` : label), w);
          for (const line of editor.render(Math.max(1, w - 2))) lines.push(` ${line}`);
        } else {
          renderOptions(lines, w, question, state);
        }
      }
      lines.push("");
      const help = current === questions.length
        ? "Enter submit • Tab/←→ navigate • Esc cancel"
        : "Tab/←→ navigate • ↑↓ select/nudge • Space multi-toggle • Enter next/select • n notes • Esc cancel";
      addWrapped(lines, " ", theme.fg("dim", help), w);
      lines.push(theme.fg("accent", NF.border.repeat(w)));
      cached = lines;
      return lines;
    }

    return { render, invalidate: () => { cached = undefined; }, handleInput };
  });

  if (result.cancelled) return undefined;
  return result.answers;
}

const WORKTREE_PARAMS = Type.Object({
  name: Type.String({ description: "Short slug/name for the worktree and branch" }),
  baseRef: Type.Optional(Type.String({ description: "Git ref to branch from. Defaults to HEAD" })),
});

const WORKTREE_AGENT_PARAMS = Type.Object({
  task: Type.String({ description: "Self-contained task for the subagent to run in an isolated git worktree" }),
  name: Type.String({ description: "Short slug/name for the worktree and branch" }),
  model: Type.Optional(Type.String({ description: "Optional pi model pattern for the subagent. Defaults to the current active model, with a lighter available model for simple tasks." })),
  baseRef: Type.Optional(Type.String({ description: "Git ref to branch from. Defaults to HEAD" })),
  timeoutMs: Type.Optional(Type.Number({ description: "Timeout in milliseconds" })),
});

const WORKTREE_DIFF_PARAMS = Type.Object({
  path: Type.String({ description: "Path to the git worktree to summarize" }),
  statOnly: Type.Optional(Type.Boolean({ description: "Only return --stat output" })),
});

const WORKTREE_REMOVE_PARAMS = Type.Object({
  path: Type.String({ description: "Path to the git worktree to remove" }),
  force: Type.Optional(Type.Boolean({ description: "Pass --force to git worktree remove" })),
});

function slugify(input: string): string {
  const slug = input.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return slug || `task-${Date.now()}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function modelLabel(model: string | undefined) {
  return model?.split("/").pop()?.replace(/^claude-/, "") ?? "default";
}

function isReadOnlyCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return true;
  if (/[;&|`]\s*(rm|mv|cp|chmod|chown|mkdir|rmdir|touch|tee|python|node|npm|pnpm|yarn|bun|make|cargo|go|git\s+(add|commit|checkout|switch|reset|clean|apply|am|merge|rebase|worktree\s+(add|remove|prune)|stash\s+(push|pop|apply)))/.test(trimmed)) {
    return false;
  }
  return /^(pwd|ls|find|rg|grep|cat|head|tail|wc|sed\s+-n|awk|git\s+(status|diff|log|show|branch|rev-parse|worktree\s+list)\b)/.test(trimmed);
}

function looksLikePlan(text: string): boolean {
  return /(^|\n)\s*(Plan|Proposed plan|Implementation plan)\s*:/i.test(text) || /(^|\n)\s*\d+\.\s+/.test(text);
}

function extractPlanSteps(text: string): string[] {
  return text
    .split("\n")
    .map((line) => /^\s*\d+[.)]\s+(.+?)\s*$/.exec(line)?.[1])
    .filter((step): step is string => Boolean(step));
}

function assistantText(messages: any[]): string {
  const last = [...messages].reverse().find((m) => m.role === "assistant" && Array.isArray(m.content));
  if (!last) return "";
  return last.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
}

async function gitRoot(pi: ExtensionAPI): Promise<string> {
  const rootResult = await pi.exec("git", ["rev-parse", "--show-toplevel"], { timeout: 10000 });
  const root = rootResult.stdout.trim();
  if (!root || rootResult.code !== 0) throw new Error("Not inside a git repository");
  return root;
}

async function createWorktree(pi: ExtensionAPI, cwd: string, name: string, baseRef = "HEAD") {
  const root = await gitRoot(pi);

  const slug = slugify(name);
  const path = join(root, ".pi", "wt", slug);
  const branch = `pibarm/${slug}`;
  await mkdir(join(root, ".pi", "wt"), { recursive: true });
  const result = await pi.exec("git", ["-C", root, "worktree", "add", "-b", branch, path, baseRef], { timeout: 30000 });
  if (result.code !== 0 && /already exists|is already checked out/i.test(result.stderr ?? "")) {
    return { root, path, branch, reused: true, stdout: result.stdout, stderr: result.stderr };
  }
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || "git worktree add failed");
  return { root, path, branch, reused: false, stdout: result.stdout, stderr: result.stderr };
}

async function listWorktrees(pi: ExtensionAPI) {
  const root = await gitRoot(pi);
  const result = await pi.exec("git", ["-C", root, "worktree", "list", "--porcelain"], { timeout: 10000 });
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || "git worktree list failed");
  const worktrees: Array<{ path: string; branch?: string; head?: string; bare?: boolean; detached?: boolean }> = [];
  let current: { path: string; branch?: string; head?: string; bare?: boolean; detached?: boolean } | undefined;
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) worktrees.push(current);
      current = { path: line.slice("worktree ".length) };
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    } else if (current && line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (current && line === "bare") {
      current.bare = true;
    } else if (current && line === "detached") {
      current.detached = true;
    }
  }
  if (current) worktrees.push(current);
  return { root, worktrees };
}

async function summarizeWorktree(pi: ExtensionAPI, path: string, statOnly = false) {
  const status = await pi.exec("git", ["-C", path, "status", "--short", "--branch"], { timeout: 10000 });
  const stat = await pi.exec("git", ["-C", path, "diff", "--stat"], { timeout: 10000 });
  const diff = statOnly ? undefined : await pi.exec("git", ["-C", path, "diff", "--", ":!package-lock.json", ":!pnpm-lock.yaml", ":!yarn.lock"], { timeout: 30000 });
  return {
    path,
    status: status.stdout.trim(),
    stat: stat.stdout.trim(),
    diff: diff?.stdout.trim(),
    code: Math.max(status.code ?? 0, stat.code ?? 0, diff?.code ?? 0),
  };
}

type PlanStatus = "captured" | "refining" | "approved";

export default function planWorktree(pi: ExtensionAPI) {
  let planMode = false;
  let toolsBeforePlan: string[] | undefined;
  let lastPlan = "";
  let planSteps: string[] = [];
  let planStatus: PlanStatus = "captured";
  let planCapturedAt = 0;

  function updatePlanWidget(ctx: ExtensionContext) {
    if (!planMode || !lastPlan) {
      ctx.ui.setWidget("pibarm-plan-steps", undefined);
      return;
    }
    const status = planStatus === "approved" ? "approved" : planStatus === "refining" ? "refining" : "pending approval";
    const steps = planSteps.length ? planSteps.map((step, index) => `${index + 1}. ${step}`) : [lastPlan.split("\n").find(Boolean) ?? "Captured plan"];
    ctx.ui.setWidget("pibarm-plan-steps", [`Plan ${status}:`, ...steps]);
  }

  function persistPlan(status: PlanStatus = planStatus) {
    if (!lastPlan) return;
    pi.appendEntry("pibarm-plan", { plan: lastPlan, steps: planSteps, status, capturedAt: planCapturedAt || Date.now() });
  }

  function capturePlan(ctx: ExtensionContext, text: string) {
    lastPlan = text;
    planSteps = extractPlanSteps(text);
    planStatus = "captured";
    planCapturedAt = Date.now();
    updatePlanWidget(ctx);
    persistPlan("captured");
  }

  function markPlanApproved(ctx: ExtensionContext) {
    planStatus = "approved";
    persistPlan("approved");
    updatePlanWidget(ctx);
  }

  async function refineCapturedPlan(ctx: ExtensionContext, feedback: string) {
    if (!lastPlan) {
      ctx.ui.notify("No captured plan to refine. Use /plan first.", "warning");
      return;
    }
    enablePlanMode(ctx);
    planStatus = "refining";
    persistPlan("refining");
    updatePlanWidget(ctx);
    pi.sendUserMessage(`Revise the captured plan based on the feedback below. Keep plan mode active, do not edit files, and return a complete revised plan that can be approved afterwards.\n\nCurrent captured plan:\n${lastPlan}\n\nFeedback/refinement request:\n${feedback}`, { deliverAs: "followUp" });
  }

  function enablePlanMode(ctx: ExtensionContext) {
    if (!toolsBeforePlan) toolsBeforePlan = pi.getActiveTools();
    pi.setActiveTools([...new Set([...toolsBeforePlan.filter((t) => !WRITE_TOOLS.has(t)), ...READ_ONLY_TOOLS])]);
    planMode = true;
    ctx.ui.setStatus("pibarm-plan", "plan");
    updatePlanWidget(ctx);
    ctx.ui.notify("Plan mode enabled: write tools disabled, bash is read-only.", "info");
  }

  function disablePlanMode(ctx: ExtensionContext) {
    if (toolsBeforePlan) pi.setActiveTools(toolsBeforePlan);
    toolsBeforePlan = undefined;
    planMode = false;
    ctx.ui.setStatus("pibarm-plan", undefined);
    ctx.ui.setWidget("pibarm-plan-steps", undefined);
    ctx.ui.notify("Plan mode disabled.", "info");
  }

  pi.registerCommand("plan", {
    description: "Enter eliciting read-only plan mode and ask for a plan",
    handler: async (args, ctx) => {
      enablePlanMode(ctx);
      const task = args.trim();
      if (task) {
        pi.sendUserMessage(`Plan this task. Ask clarifying questions first if needed. Do not edit files.\n\nTask: ${task}`);
      }
    },
  });

  pi.registerCommand("plan-mode", {
    description: "Toggle read-only plan mode",
    handler: async (_args, ctx) => planMode ? disablePlanMode(ctx) : enablePlanMode(ctx),
  });

  pi.registerCommand("plan-show", {
    description: "Show the last captured plan and parsed steps",
    handler: async (_args, ctx) => {
      if (!lastPlan) {
        ctx.ui.notify("No captured plan yet. Use /plan first.", "warning");
        return;
      }
      const steps = planSteps.length ? `\n\nParsed steps:\n${planSteps.map((step, i) => `${i + 1}. ${step}`).join("\n")}` : "";
      ctx.ui.notify(`Status: ${planStatus}\n\n${lastPlan}${steps}\n\nNext: /approve-plan [active|worktree <name>] or /refine-plan <feedback>`, "info");
    },
  });

  async function executeCapturedPlan(ctx: ExtensionContext, worktreeName?: string) {
    if (!lastPlan) {
      ctx.ui.notify("No captured plan yet. Use /plan first.", "warning");
      return;
    }
    markPlanApproved(ctx);
    disablePlanMode(ctx);
    if (worktreeName) {
      const wt = await createWorktree(pi, ctx.cwd, worktreeName);
      pi.sendUserMessage(`Execute the approved plan in the isolated git worktree at ${wt.path}. Make all file changes under that path, not the active repo.\n\nApproved plan:\n${lastPlan}`);
      return;
    }
    pi.sendUserMessage(`Execute the approved plan in the active checkout.\n\nApproved plan:\n${lastPlan}`);
  }

  async function approvePlanCommand(args: string, ctx: ExtensionContext) {
    const trimmed = args.trim();
    if (!trimmed || /^active$/i.test(trimmed)) {
      await executeCapturedPlan(ctx);
      return;
    }
    const match = /^(?:worktree\s+)?(.+)/i.exec(trimmed);
    if (match?.[1]) await executeCapturedPlan(ctx, match[1].trim());
  }

  pi.registerCommand("execute-plan", {
    description: "Execute the last approved plan; add 'worktree <name>' to isolate changes",
    handler: async (args, ctx) => {
      const match = /^worktree\s+(.+)/i.exec(args.trim());
      await executeCapturedPlan(ctx, match?.[1]);
    },
  });

  pi.registerCommand("approve-plan", {
    description: "Approve and execute the captured plan: /approve-plan [active|worktree <name>|<worktree-name>]",
    handler: async (args, ctx) => approvePlanCommand(args, ctx),
  });

  pi.registerCommand("refine-plan", {
    description: "Refine the captured plan and require re-approval: /refine-plan <feedback>",
    handler: async (args, ctx) => {
      const feedback = args.trim() || await ctx.ui.editor("Refine captured plan", "Describe what should change before approval:\n");
      if (feedback?.trim()) await refineCapturedPlan(ctx, feedback.trim());
      else ctx.ui.notify("Plan retained unchanged. Use /approve-plan or /refine-plan when ready.", "info");
    },
  });

  pi.registerCommand("worktrees", {
    description: "List git worktrees for this repository",
    handler: async (_args, ctx) => {
      try {
        const { worktrees } = await listWorktrees(pi);
        const text = worktrees.map((wt) => `${wt.path}${wt.branch ? `  [${wt.branch}]` : ""}${wt.detached ? "  (detached)" : ""}`).join("\n");
        ctx.ui.notify(text || "No worktrees found", "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("worktree-diff", {
    description: "Show status and diff stat for a worktree: /worktree-diff <path>",
    handler: async (args, ctx) => {
      const path = args.trim();
      if (!path) {
        ctx.ui.notify("Usage: /worktree-diff <path>", "warning");
        return;
      }
      try {
        const summary = await summarizeWorktree(pi, path, true);
        ctx.ui.notify([summary.status, summary.stat].filter(Boolean).join("\n\n") || "No changes", "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("worktree-remove", {
    description: "Remove a git worktree: /worktree-remove [--force] <path>",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const force = parts[0] === "--force";
      const path = force ? parts.slice(1).join(" ") : parts.join(" ");
      if (!path) {
        ctx.ui.notify("Usage: /worktree-remove [--force] <path>", "warning");
        return;
      }
      if (ctx.hasUI) {
        const ok = await ctx.ui.confirm("Remove worktree?", `${path}${force ? "\n\nUsing --force." : ""}`);
        if (!ok) return;
      }
      const root = await gitRoot(pi);
      const result = await pi.exec("git", ["-C", root, "worktree", "remove", ...(force ? ["--force"] : []), path], { timeout: 30000 });
      ctx.ui.notify(result.code === 0 ? `Removed ${path}` : (result.stderr || result.stdout || "remove failed"), result.code === 0 ? "info" : "error");
    },
  });

  pi.registerTool({
    name: "elicit_plan_questions",
    label: "Elicit Plan Questions",
    description: "Ask the user specific questions before finalizing or executing a plan.",
    promptSnippet: "Ask the user clarifying questions for plan elicitation",
    promptGuidelines: ["Use elicit_plan_questions in plan mode before finalizing a plan when requirements, risks, scope, or execution location are unclear."],
    parameters: ELICIT_PARAMS,
    async execute(_id, params, _signal, _update, ctx) {
      const questions = normalizePlanQuestions(params.questions as Array<string | Record<string, unknown>>);
      const prompt = `${params.context ? `${params.context}\n\n` : ""}${questions.map((q, i) => {
        const options = q.options.length ? ` [${q.options.map((o) => o.label).join(" / ")}]` : "";
        return `${i + 1}. ${q.question}${options}`;
      }).join("\n")}`;
      if (!ctx.hasUI) {
        return { content: [{ type: "text", text: `Questions needing answers:\n${prompt}` }], details: undefined };
      }

      if (params.edit !== false && ctx.mode === "tui") {
        const answers = await askTabbedPlanQuestions(ctx, questions, params.context);
        if (!answers) {
          return { content: [{ type: "text", text: "User cancelled the planning questions." }], details: { questions, answers: [], answer: null } };
        }
        return {
          content: [{ type: "text", text: answers.some((a) => a.answer) ? `User answered:\n${answers.map((a, i) => `${i + 1}. ${a.answer || "(blank)"}${a.notes ? ` — note: ${a.notes}` : ""}`).join("\n")}` : "User did not provide answers." }],
          details: { questions, answers, answer: answers.map((a, i) => `${i + 1}. ${a.answer}`).join("\n") },
        };
      }

      const answers = [];
      for (let i = 0; i < questions.length; i++) {
        const prefix = params.context ? `${params.context}\n\n` : "";
        const answer = await ctx.ui.input(`${prefix}${i + 1}/${questions.length}: ${questions[i]!.question}`, "");
        answers.push({ id: questions[i]!.id, question: questions[i]!.question, answer: answer?.trim() ?? "", value: answer?.trim() ?? "" });
      }
      return {
        content: [{ type: "text", text: answers.some((a) => a.answer) ? `User answered:\n${answers.map((a, i) => `${i + 1}. ${a.answer || "(blank)"}`).join("\n")}` : "User did not provide answers." }],
        details: { questions, answers, answer: answers.map((a, i) => `${i + 1}. ${a.answer}`).join("\n") },
      };
    },
  });

  pi.registerTool({
    name: "create_git_worktree",
    label: "Create Git Worktree",
    description: "Create an isolated git worktree for safe execution without modifying the active checkout.",
    promptSnippet: "Create an isolated git worktree for implementation or subagent work",
    promptGuidelines: ["Use create_git_worktree before executing risky or parallel work that should not touch the active checkout."],
    parameters: WORKTREE_PARAMS,
    async execute(_id, params, _signal, _update, ctx) {
      const wt = await createWorktree(pi, ctx.cwd, params.name, params.baseRef ?? "HEAD");
      return { content: [{ type: "text", text: `Worktree ready: ${wt.path}\nBranch: ${wt.branch}${wt.reused ? "\n(reused existing worktree/branch)" : ""}` }], details: wt };
    },
  });

  pi.registerTool({
    name: "summarize_worktree_diff",
    label: "Summarize Worktree Diff",
    description: "Return git status, diff stat, and optionally diff for a worktree.",
    promptSnippet: "Summarize changes in an isolated git worktree",
    promptGuidelines: ["Use summarize_worktree_diff after worktree execution to report changed files and review the diff before merge."],
    parameters: WORKTREE_DIFF_PARAMS,
    async execute(_id, params) {
      const summary = await summarizeWorktree(pi, params.path, params.statOnly ?? false);
      const text = [
        `Status:\n${summary.status || "(clean)"}`,
        `Diff stat:\n${summary.stat || "(none)"}`,
        summary.diff && `Diff:\n${summary.diff}`,
      ].filter(Boolean).join("\n\n");
      return { content: [{ type: "text", text }], details: summary, isError: summary.code !== 0 };
    },
  });

  pi.registerTool({
    name: "remove_git_worktree",
    label: "Remove Git Worktree",
    description: "Remove a git worktree after review/merge or abandoned work.",
    promptSnippet: "Remove an isolated git worktree",
    promptGuidelines: ["Use remove_git_worktree only after the user confirms the worktree is no longer needed."],
    parameters: WORKTREE_REMOVE_PARAMS,
    async execute(_id, params) {
      const root = await gitRoot(pi);
      const result = await pi.exec("git", ["-C", root, "worktree", "remove", ...(params.force ? ["--force"] : []), params.path], { timeout: 30000 });
      return {
        content: [{ type: "text", text: result.code === 0 ? `Removed ${params.path}` : (result.stderr || result.stdout || "remove failed") }],
        details: result,
        isError: result.code !== 0,
      };
    },
  });

  pi.registerTool({
    name: "run_worktree_agent",
    label: "Run Worktree Agent",
    description: "Create an isolated git worktree and run a non-interactive pi subagent inside it.",
    promptSnippet: "Run a subagent in a separate git worktree",
    promptGuidelines: ["Use run_worktree_agent for parallel implementation, verification, or exploratory changes that must not affect the active checkout."],
    parameters: WORKTREE_AGENT_PARAMS,
    async execute(_id, params, signal, _update, ctx) {
      const wt = await createWorktree(pi, ctx.cwd, params.name, params.baseRef ?? "HEAD");
      const modelSelection = selectAgentModelRef(ctx, params.model, params.task);
      const taskId = `worktree-agent:${params.name}`;
      upsertAgentTask({ id: taskId, label: `wt ${params.name}`, status: "running", session: modelLabel(modelSelection.model) });
      updateTaskWidget(ctx);
      const piArgs = ["-p"];
      if (modelSelection.model) piArgs.push("--model", modelSelection.model);
      piArgs.push(params.task);
      const command = `cd ${shellQuote(wt.path)} && pi ${piArgs.map(shellQuote).join(" ")}`;
      const result = await pi.exec("bash", ["-lc", command], { signal, timeout: params.timeoutMs ?? 600000 });
      finishAgentTask(taskId, result.code === 0 ? "done" : "failed", result.code === 0 ? undefined : `exit ${result.code}`);
      updateTaskWidget(ctx);
      const text = [result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n\n--- stderr ---\n");
      return { content: [{ type: "text", text: text || `(subagent exited ${result.code})` }], details: { worktree: wt, modelSelection, result }, isError: result.code !== 0 };
    },
  });

  pi.on("tool_call", async (event) => {
    if (!planMode) return;
    if (WRITE_TOOLS.has(event.toolName)) return { block: true, reason: "Plan mode is read-only. Approve/execute the plan before editing files." };
    if (event.toolName === "bash" && !isReadOnlyCommand(String((event.input as any).command ?? ""))) {
      return { block: true, reason: "Plan mode blocks non-read-only bash commands. Use /execute-plan or create a worktree after approval." };
    }
  });

  pi.on("before_agent_start", async () => {
    if (!planMode) return;
    const pending = lastPlan ? `\n- A captured plan is ${planStatus}; if the user gives feedback, revise the full plan and require approval again before execution.\n- Current captured plan:\n${lastPlan}` : "";
    return {
      message: {
        customType: "pibarm-plan-mode",
        display: false,
        content: `PLAN MODE IS ACTIVE.\n- Do not modify files.\n- Prefer reading, inspection, mcporter discovery, and analysis.\n- If one decision is needed, call question. If multiple requirements are unclear, call elicit_plan_questions before presenting the final plan.\n- Present the final answer as a concise plan with risks, open questions, and validation steps.\n- Recommend whether execution should happen in a git worktree.${pending}`,
      },
    };
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!planMode || !ctx.hasUI) return;
    const text = assistantText(event.messages as any[]);
    if (!looksLikePlan(text)) return;
    capturePlan(ctx, text);
    const choice = await ctx.ui.select("Plan captured. What next?", [
      "Approve: execute in a git worktree",
      "Approve: execute in active checkout",
      "Refine plan, then re-approve",
      "Keep plan for later",
    ]);
    if (choice?.startsWith("Refine")) {
      const refinement = await ctx.ui.editor("Refine captured plan", "Describe what should change before approval:\n");
      if (refinement?.trim()) await refineCapturedPlan(ctx, refinement.trim());
      else ctx.ui.notify("Plan retained unchanged. Use /approve-plan or /refine-plan when ready.", "info");
    } else if (choice?.includes("worktree")) {
      const name = await ctx.ui.input("Worktree name", "plan-work");
      if (name?.trim()) await executeCapturedPlan(ctx, name.trim());
      else ctx.ui.notify("Plan retained. Use /approve-plan worktree <name> when ready.", "info");
    } else if (choice?.includes("active")) {
      await executeCapturedPlan(ctx);
    } else {
      ctx.ui.notify("Plan retained. Use /approve-plan or /refine-plan when ready.", "info");
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    const restored = ctx.sessionManager.getEntries()
      .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === "pibarm-plan")
      .pop() as { data?: { plan?: string; steps?: string[]; status?: PlanStatus; capturedAt?: number } } | undefined;
    if (restored?.data?.plan) lastPlan = restored.data.plan;
    if (restored?.data?.steps) planSteps = restored.data.steps;
    if (restored?.data?.status) planStatus = restored.data.status;
    if (restored?.data?.capturedAt) planCapturedAt = restored.data.capturedAt;
    updatePlanWidget(ctx);
  });
}
