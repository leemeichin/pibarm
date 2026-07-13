import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const QUESTION_TOOLS = new Set(["question", "elicit_plan_questions"]);
const DEFAULT_COOLDOWN_SECONDS = 60;

export function sanitizeOscField(value: string, maxChars = 180): string {
  // Strip control bytes and the OSC field separator so tool-controlled text
  // cannot shift escape-sequence fields, and slice by code points so
  // multi-byte sequences are never cut in half.
  // oxlint-disable-next-line no-control-regex -- control bytes are matched deliberately
  const cleaned = value.replace(/[\u0000-\u001f\u007f;]/g, " ");
  return [...cleaned].slice(0, maxChars).join("");
}

export function cooldownMs(raw: string | undefined): number {
  const seconds = Number(raw ?? DEFAULT_COOLDOWN_SECONDS);
  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_COOLDOWN_SECONDS * 1000;
  return seconds * 1000;
}

function isKitty(): boolean {
  // kitty sets TERM=xterm-kitty and KITTY_WINDOW_ID, not TERM_PROGRAM.
  return (
    Boolean(process.env.KITTY_WINDOW_ID) ||
    /kitty/i.test(process.env.TERM ?? "") ||
    process.env.TERM_PROGRAM === "kitty"
  );
}

async function nativeNotify(pi: ExtensionAPI, canWriteEscapes: boolean, title: string, body: string) {
  if (canWriteEscapes && isKitty()) {
    process.stdout.write(`\x1b]99;i=1:d=0;${title}\x1b\\`);
    process.stdout.write(`\x1b]99;i=1:p=body;${body}\x1b\\`);
    return;
  }

  const terminalNotifier = process.env.PI_NOTIFY_TERMINAL_NOTIFIER;
  if (terminalNotifier) {
    await pi.exec(terminalNotifier, ["-title", title, "-message", body], { timeout: 5000 });
    return;
  }

  if (canWriteEscapes) process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
}

export default function waitingNotify(pi: ExtensionAPI) {
  let lastNotification = 0;

  pi.on("tool_execution_start", async (event, ctx) => {
    if (!QUESTION_TOOLS.has(event.toolName)) return;

    // In rpc/json modes stdout is the machine protocol channel; injected OSC
    // bytes would corrupt it. terminal-notifier (a subprocess) is still fine.
    const canWriteEscapes = ctx.mode === "tui" && process.stdout.isTTY === true;
    if (!canWriteEscapes && !process.env.PI_NOTIFY_TERMINAL_NOTIFIER) return;

    const now = Date.now();
    if (now - lastNotification < cooldownMs(process.env.PI_NOTIFY_COOLDOWN_SECONDS)) return;
    lastNotification = now;

    const title = "Pi is waiting";
    const body =
      process.env.PI_NOTIFY_INCLUDE_QUESTION === "1"
        ? sanitizeOscField(`${event.toolName}: ${JSON.stringify(event.args)}`)
        : "A question is waiting for your input.";

    await nativeNotify(pi, canWriteEscapes, title, body).catch(() => undefined);
  });
}
