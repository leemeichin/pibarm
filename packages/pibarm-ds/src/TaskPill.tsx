import type { HTMLAttributes } from "react";

export type TaskStatus = "todo" | "running" | "done" | "failed";

export interface TaskPillProps extends HTMLAttributes<HTMLSpanElement> {
  status?: TaskStatus;
  /** Task number in the widget. */
  index?: number | string | null;
  /** Agent role, e.g. "scout". */
  kind?: string | null;
  label?: string;
  /** Trailing detail, e.g. an elapsed time or a file count. */
  meta?: string | null;
  /** "term" renders the flat terminal-native form. */
  variant?: "web" | "term";
  className?: string;
}

const ICONS: Record<TaskStatus, string> = {
  todo: "○",
  running: "●",
  done: "✓",
  failed: "!",
};

/**
 * Task widget pill: the ‹ ○ 1 · inspect auth › element pibarm renders below
 * the editor to keep delegated work visually connected to the session.
 * @category status
 */
export function TaskPill({
  status = "todo",
  index = null,
  kind = null,
  label = "",
  meta = null,
  variant = "web",
  className = "",
  ...rest
}: TaskPillProps) {
  const bare = variant === "term" ? "pib-pill--bare" : "";
  const cls = `pib-pill pib-pill--${status} ${bare} ${className}`.replace(/\s+/g, " ").trim();
  const showSep = index != null || kind;

  return (
    <span className={cls} {...rest}>
      <span className="pib-pill__gl">‹</span>
      <span className="pib-pill__ic">{ICONS[status] || "○"}</span>
      {index != null && <span className="pib-pill__idx">{index}</span>}
      {kind && <span className="pib-pill__kind">{kind}</span>}
      {showSep && <span className="pib-pill__sep">·</span>}
      <span className="pib-pill__lbl">{label}</span>
      {meta && (
        <>
          <span className="pib-pill__sep">·</span>
          <span className="pib-pill__meta">{meta}</span>
        </>
      )}
      <span className="pib-pill__gl">›</span>
    </span>
  );
}
