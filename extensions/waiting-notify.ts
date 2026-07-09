import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { macIdleSeconds } from "../lib/signal-question.js";

const QUESTION_TOOLS = new Set(["question", "elicit_plan_questions"]);
const DEFAULT_IDLE_SECONDS = 300;
const DEFAULT_COOLDOWN_SECONDS = 60;

async function nativeNotify(pi: ExtensionAPI, title: string, body: string) {
  if (process.env.TERM_PROGRAM === "kitty") {
    process.stdout.write(`\x1b]99;i=1:d=0;${title}\x1b\\`);
    process.stdout.write(`\x1b]99;i=1:p=body;${body}\x1b\\`);
    return;
  }

  const terminalNotifier = process.env.PI_NOTIFY_TERMINAL_NOTIFIER;
  if (terminalNotifier) {
    await pi.exec(terminalNotifier, ["-title", title, "-message", body], { timeout: 5000 });
    return;
  }

  process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
}

export default function waitingNotify(pi: ExtensionAPI) {
  let lastNotification = 0;

  pi.on("tool_execution_start", async (event) => {
    if (!QUESTION_TOOLS.has(event.toolName)) return;

    const now = Date.now();
    const cooldownMs = Number(process.env.PI_NOTIFY_COOLDOWN_SECONDS ?? DEFAULT_COOLDOWN_SECONDS) * 1000;
    if (now - lastNotification < cooldownMs) return;
    lastNotification = now;

    const title = "Pi is waiting";
    const body = process.env.PI_NOTIFY_INCLUDE_QUESTION === "1"
      ? `${event.toolName}: ${JSON.stringify(event.args).slice(0, 180)}`
      : "A question is waiting for your input.";

    const idleSeconds = await macIdleSeconds(pi).catch(() => undefined);
    const idleThreshold = Number(process.env.PI_NOTIFY_SIGNAL_IDLE_SECONDS ?? DEFAULT_IDLE_SECONDS);
    if (idleSeconds !== undefined && idleSeconds >= idleThreshold) return;

    await nativeNotify(pi, title, body).catch(() => undefined);
  });
}
