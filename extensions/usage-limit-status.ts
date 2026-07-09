import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const RESET_HEADERS = [
  "retry-after",
  "x-ratelimit-reset",
  "anthropic-ratelimit-requests-reset",
  "anthropic-ratelimit-input-tokens-reset",
  "anthropic-ratelimit-output-tokens-reset",
  "anthropic-ratelimit-tokens-reset",
];

function parseReset(headers: Record<string, string | undefined>): Date | undefined {
  const retryAfter = headers["retry-after"];
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return new Date(Date.now() + seconds * 1000);
    const date = new Date(retryAfter);
    if (!Number.isNaN(date.getTime())) return date;
  }

  for (const name of RESET_HEADERS.slice(1)) {
    const value = headers[name];
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
}

function formatReset(date: Date | undefined) {
  if (!date) return "limit hit";
  const minutes = Math.max(0, Math.ceil((date.getTime() - Date.now()) / 60000));
  return minutes > 0 ? `limit ${minutes}m` : "limit soon";
}

export default function usageLimitStatus(pi: ExtensionAPI) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activeCtx: ExtensionContext | undefined;

  function clear() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    activeCtx?.ui.setStatus("usage-limit", undefined);
  }

  pi.on("after_provider_response", (event, ctx) => {
    if (event.status !== 429) return;
    activeCtx = ctx;
    const reset = parseReset(event.headers as Record<string, string | undefined>);
    ctx.ui.setStatus("usage-limit", ctx.ui.theme.fg("warning", formatReset(reset)));

    if (timer) clearTimeout(timer);
    if (reset) timer = setTimeout(clear, Math.max(1000, reset.getTime() - Date.now()));
  });

  pi.on("session_shutdown", clear);
}
