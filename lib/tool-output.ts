import { formatSize, truncateHead, truncateTail } from "@earendil-works/pi-coding-agent";

// Tool results must stay bounded (pi's built-in tools cap at 50KB / 2000
// lines); these wrap pi's truncation helpers with a human-readable notice.

export function clipTail(text: string): string {
  const result = truncateTail(text);
  if (!result.truncated) return text;
  return `[output truncated: showing last ${result.outputLines} of ${result.totalLines} lines (${formatSize(result.totalBytes)} total)]\n\n${result.content}`;
}

export function clipHead(text: string): string {
  const result = truncateHead(text);
  if (!result.truncated) return text;
  return `${result.content}\n\n[output truncated: showing first ${result.outputLines} of ${result.totalLines} lines (${formatSize(result.totalBytes)} total)]`;
}
