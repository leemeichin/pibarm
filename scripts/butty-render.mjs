#!/usr/bin/env node
// Renders a `pi --mode json` event stream as a live human-readable transcript.
// Used by Butty panes so agent reasoning, responses, and tool activity are
// visible while the agent runs, instead of only a final answer at exit.
import { createInterface } from "node:readline";

let mode = "";

function out(text) {
  process.stdout.write(text);
}

function switchMode(next) {
  if (mode === next) return;
  if (mode === "thinking" || mode === "text") out("\n");
  if (next === "thinking") out("\n· thinking ·\n");
  if (next === "text" && mode) out("\n· response ·\n");
  mode = next;
}

function compact(value, max = 200) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function resultPreview(result) {
  const content = result && typeof result === "object" ? result.content : undefined;
  const text = Array.isArray(content)
    ? content
        .filter((part) => part?.type === "text")
        .map((part) => part.text)
        .join("\n")
    : typeof result === "string"
      ? result
      : "";
  return text
    .split("\n")
    .filter(Boolean)
    .slice(0, 3)
    .map((line) => compact(line, 160));
}

function handleEvent(event) {
  switch (event.type) {
    case "message_update": {
      const delta = event.assistantMessageEvent;
      if (delta?.type === "text_delta" && typeof delta.delta === "string") {
        switchMode("text");
        out(delta.delta);
      } else if (delta?.type === "thinking_delta" && typeof delta.delta === "string") {
        switchMode("thinking");
        out(delta.delta);
      }
      return;
    }
    case "message_end": {
      const message = event.message;
      if (message?.role === "assistant" && (message.stopReason === "error" || message.stopReason === "aborted")) {
        switchMode("");
        out(`\n[${message.stopReason}] ${message.errorMessage ?? ""}\n`);
      }
      return;
    }
    case "tool_execution_start":
      switchMode("");
      out(`\n▶ ${event.toolName} ${compact(event.args)}\n`);
      return;
    case "tool_execution_end": {
      const preview = resultPreview(event.result);
      out(`${event.isError ? "✖" : "✔"} ${event.toolName}${preview.length ? `: ${preview[0]}` : ""}\n`);
      for (const line of preview.slice(1)) out(`  ${line}\n`);
      return;
    }
    case "auto_retry_start":
      switchMode("");
      out(`\n[retry ${event.attempt}/${event.maxAttempts}] ${compact(event.errorMessage, 160)}\n`);
      return;
    case "compaction_start":
      switchMode("");
      out(`\n[compacting context: ${event.reason}]\n`);
      return;
    case "agent_end":
      switchMode("");
      out("\n");
      return;
    default:
      return;
  }
}

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    handleEvent(JSON.parse(line));
  } catch {
    // Not a JSON event (e.g. stderr noise merged into the stream): pass through.
    out(`${line}\n`);
  }
});
