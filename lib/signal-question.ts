import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEFAULT_IDLE_SECONDS = 300;
const DEFAULT_REPLY_SECONDS = 600;

export async function macIdleSeconds(pi: ExtensionAPI): Promise<number | undefined> {
  if (process.platform !== "darwin") return undefined;
  const result = await pi.exec("ioreg", ["-c", "IOHIDSystem"], { timeout: 5000 });
  const match = /HIDIdleTime\"\s*=\s*(\d+)/.exec(result.stdout ?? "");
  return match ? Math.floor(Number(match[1]) / 1_000_000_000) : undefined;
}

function signalInvocation(args: string[]) {
  const account = process.env.PI_NOTIFY_SIGNAL_ACCOUNT;
  const accountFlag = process.env.PI_NOTIFY_SIGNAL_ACCOUNT_FLAG ?? "-a";
  return account ? [accountFlag, account, ...args] : args;
}

export async function sendSignalMessage(pi: ExtensionAPI, body: string): Promise<boolean> {
  const to = process.env.PI_NOTIFY_SIGNAL_TO;
  const sendArgs = to ? ["send", "-m", body, to] : ["send", "--note-to-self", "--notify-self", "-m", body];
  const result = await pi.exec(process.env.PI_NOTIFY_SIGNAL_CLI ?? "signal-cli", signalInvocation(sendArgs), { timeout: 15000 });
  return result.code === 0;
}

function findReply(stdout: string): string | undefined {
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      const envelope = item?.envelope ?? {};
      const message = envelope.dataMessage?.message ?? envelope.syncMessage?.sentMessage?.message;
      if (typeof message === "string" && message.trim() && !message.trim().startsWith("π")) return message.trim();
    } catch {
      // Ignore non-JSON noise.
    }
  }
}

async function receiveSignalReply(pi: ExtensionAPI): Promise<string | undefined> {
  const deadline = Date.now() + Number(process.env.PI_NOTIFY_SIGNAL_REPLY_SECONDS ?? DEFAULT_REPLY_SECONDS) * 1000;
  while (Date.now() < deadline) {
    const seconds = Math.max(1, Math.min(15, Math.ceil((deadline - Date.now()) / 1000)));
    const result = await pi.exec(
      process.env.PI_NOTIFY_SIGNAL_CLI ?? "signal-cli",
      signalInvocation(["-o", "json", "receive", "-t", String(seconds), "--max-messages", "10", "--ignore-attachments", "--ignore-stories", "--ignore-avatars", "--ignore-stickers"]),
      { timeout: (seconds + 5) * 1000 },
    );
    const reply = findReply(result.stdout ?? "");
    if (reply) return reply;
  }
}

export async function askSignalWhenIdle(pi: ExtensionAPI, prompt: string): Promise<string | undefined> {
  if (process.env.PI_NOTIFY_SIGNAL_DISABLE === "1") return undefined;
  const idle = await macIdleSeconds(pi).catch(() => undefined);
  const threshold = Number(process.env.PI_NOTIFY_SIGNAL_IDLE_SECONDS ?? DEFAULT_IDLE_SECONDS);
  if (process.env.PI_NOTIFY_SIGNAL_FORCE !== "1" && (idle === undefined || idle < threshold)) return undefined;

  const sent = await sendSignalMessage(pi, `π ${prompt}\n\nReply directly in this chat.`);
  if (!sent) return undefined;
  return receiveSignalReply(pi);
}
