import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

type Model = NonNullable<ExtensionContext["model"]>;

export interface ModelSelection {
  model?: string;
  source: "explicit" | "current" | "simple-task-heuristic";
  simpleTask: boolean;
}

export function currentModelRef(ctx: ExtensionContext): string | undefined {
  return ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
}

export function effectiveModelRef(ctx: ExtensionContext, requestedModel?: string): string | undefined {
  return requestedModel ?? currentModelRef(ctx);
}

export function selectAgentModelRef(
  ctx: ExtensionContext,
  requestedModel: string | undefined,
  task: string,
): ModelSelection {
  if (requestedModel) return { model: requestedModel, source: "explicit", simpleTask: isSimpleScopeTask(task) };

  const current = ctx.model;
  const currentRef = current ? modelRef(current) : undefined;
  if (!isSimpleScopeTask(task)) return { model: currentRef, source: "current", simpleTask: false };

  const lighter = chooseLighterAvailableModel(ctx, current);
  if (lighter) return { model: modelRef(lighter), source: "simple-task-heuristic", simpleTask: true };

  return { model: currentRef, source: "current", simpleTask: true };
}

function modelRef(model: Model): string {
  return `${model.provider}/${model.id}`;
}

function isSimpleScopeTask(task: string): boolean {
  const normalized = task.toLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean).length;

  if (task.length > 700 || words > 120) return false;
  if (/```|diff --git|stack trace|traceback|exception|\b(error|panic|segfault)\b/.test(normalized)) return false;
  if (
    /\b(implement|modify|edit|write|create|delete|refactor|migrate|redesign|architect|debug|fix|repair|optimi[sz]e|security|auth|permission|database|schema|production|deploy|release|failing|flaky|race|deadlock|concurrency)\b/.test(
      normalized,
    )
  )
    return false;

  return /\b(summarize|summary|find|locate|list|read|inspect|check|verify|smoke|capture|grep|search|map|inventory|describe|explain|identify)\b/.test(
    normalized,
  );
}

function chooseLighterAvailableModel(ctx: ExtensionContext, current: Model | undefined): Model | undefined {
  const available = ctx.modelRegistry.getAvailable().filter((model) => model.input.includes("text"));
  if (available.length === 0) return undefined;

  const sorted = [...available].sort(compareForSimpleTasks);
  if (!current) return sorted[0];

  const currentRef = modelRef(current);
  return sorted.find((model) => modelRef(model) !== currentRef && compareForSimpleTasks(model, current) < 0);
}

function compareForSimpleTasks(a: Model, b: Model): number {
  return compareTuple(scoreModel(a), scoreModel(b));
}

function compareTuple(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function scoreModel(model: Model): number[] {
  const price = model.cost.input + model.cost.output * 3;
  return [capabilityTier(model), price, model.contextWindow, model.maxTokens];
}

function capabilityTier(model: Model): number {
  const label = `${model.provider} ${model.id} ${model.name}`.toLowerCase();
  if (/\b(nano|mini|small|haiku|flash-lite|flash|lite|fast|instant)\b|\b[78]b\b/.test(label)) return 0;
  if (/\b(opus|pro|ultra|max|large|o[134]|120b|70b)\b/.test(label)) return 3;
  if (/\b(sonnet|gpt-5|gpt-4|gemini|mistral-medium|medium)\b/.test(label)) return 2;
  return model.reasoning ? 2 : 1;
}
