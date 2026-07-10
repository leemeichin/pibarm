import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const TRIGGER_RE = /\bar kid\b/i;
const EXACT_ECHO = "alright ar kid";

function isCommandPrompt(text: string) {
  const trimmed = text.trimStart();
  return trimmed.startsWith("/") || trimmed.startsWith("!");
}

export default function arKidDialect(pi: ExtensionAPI) {
  pi.on("input", async (event) => {
    if (event.source === "extension") return { action: "continue" as const };
    if (isCommandPrompt(event.text)) return { action: "continue" as const };

    const normalized = event.text.trim().toLowerCase().replace(/\s+/g, " ");
    if (normalized === EXACT_ECHO) {
      pi.sendMessage({
        customType: "ar-kid",
        content: EXACT_ECHO,
        display: true,
        details: { easterEgg: true },
      });
      return { action: "handled" as const };
    }

    if (!TRIGGER_RE.test(event.text)) return { action: "continue" as const };

    return {
      action: "transform" as const,
      text: `${event.text}\n\nEaster egg instruction: For this response, write in a warm Manchester/Bolton dialect. Keep it understandable and don't overdo eye-dialect.`,
    };
  });
}
