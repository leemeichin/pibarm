import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const RESET_HEADERS = [
  "retry-after",
  "x-ratelimit-reset",
  "anthropic-ratelimit-requests-reset",
  "anthropic-ratelimit-input-tokens-reset",
  "anthropic-ratelimit-output-tokens-reset",
  "anthropic-ratelimit-tokens-reset",
];

// Keep the warning up at most this long when no reset time can be derived.
const FALLBACK_CLEAR_MS = 5 * 60000;

export function parseResetValue(value: string): Date | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Epoch seconds / milliseconds (OpenAI-style x-ratelimit-reset).
  if (/^\d{10}$/.test(trimmed)) return new Date(Number(trimmed) * 1000);
  if (/^\d{13}$/.test(trimmed)) return new Date(Number(trimmed));
  // Golang-style durations like "6m0s", "1h2m", "30s", "250ms".
  const duration = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?(?:(\d+)ms)?$/);
  if (duration && (duration[1] || duration[2] || duration[3] || duration[4])) {
    const ms = (Number(duration[1] ?? 0) * 3600 + Number(duration[2] ?? 0) * 60 + Number(duration[3] ?? 0)) * 1000 + Number(duration[4] ?? 0);
    return new Date(Date.now() + ms);
  }
  const date = new Date(trimmed);
  if (!Number.isNaN(date.getTime())) return date;
  return undefined;
}

export function parseReset(headers: Record<string, string | undefined>): Date | undefined {
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
    const date = parseResetValue(value);
    if (date) return date;
  }
  return undefined;
}

function formatReset(date: Date | undefined) {
  if (!date) return "limit hit";
  const minutes = Math.max(0, Math.ceil((date.getTime() - Date.now()) / 60000));
  return minutes > 0 ? `limit ${minutes}m` : "limit soon";
}

export default function usageLimitStatus(pi: ExtensionAPI) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activeCtx: ExtensionContext | undefined;
  let warningShown = false;

  function clear() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    warningShown = false;
    activeCtx?.ui.setStatus("usage-limit", undefined);
  }

  pi.on("after_provider_response", (event, ctx) => {
    if (event.status !== 429) {
      // A successful response means the limit is no longer in effect.
      if (warningShown) clear();
      return;
    }
    activeCtx = ctx;
    warningShown = true;
    const reset = parseReset(event.headers as Record<string, string | undefined>);
    ctx.ui.setStatus("usage-limit", ctx.ui.theme.fg("warning", formatReset(reset)));

    if (timer) clearTimeout(timer);
    // Without a parseable reset time, fall back to a bounded timeout instead
    // of leaving the warning up until the session ends.
    const clearInMs = reset ? Math.max(1000, reset.getTime() - Date.now()) : FALLBACK_CLEAR_MS;
    timer = setTimeout(clear, clearInMs);
  });

  pi.on("session_shutdown", clear);
}
