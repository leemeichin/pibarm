import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const TIMEOUT_MS = 30000;
const MAX_OUTPUT = 12000;

function truncate(text: string) {
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… truncated ${text.length - MAX_OUTPUT} chars` : text;
}

export default function inlineShell(pi: ExtensionAPI) {
  pi.on("input", async (event) => {
    if (event.source === "extension") return;

    const text = event.text.trimStart();
    if (!text.startsWith("!") || text.startsWith("!!")) return;

    const command = text.slice(1).trim();
    if (!command) return { action: "handled" as const };

    const result = await pi.exec("bash", ["-lc", command], { timeout: TIMEOUT_MS });
    const output = truncate([result.stdout, result.stderr].filter(Boolean).join("\n").trim() || `(exit ${result.code ?? 0}, no output)`);

    pi.sendMessage({
      customType: "inline-shell",
      content: `$ ${command}\n${output}`,
      display: true,
      details: { command, code: result.code },
    });

    return { action: "handled" as const };
  });
}
