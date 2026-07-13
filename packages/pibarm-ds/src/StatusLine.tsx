import type { HTMLAttributes } from "react";
import { Icon } from "./Icon.js";

export interface PullRequest {
  num: number;
  state: "open" | "draft" | "merged" | "closed";
}

export interface StatusLineProps extends HTMLAttributes<HTMLDivElement> {
  project?: string;
  model?: string;
  /** Context window used, as a percentage. */
  context?: number;
  branch?: string;
  /** Uncommitted file count; hidden when 0. */
  dirty?: number;
  pr?: PullRequest | null;
  ci?: "pass" | "running" | "fail" | "unknown";
  /** "bare" drops the panel chrome. */
  variant?: "panel" | "bare";
  theme?: "dark" | "light";
  className?: string;
}

const PR_TONE: Record<string, string> = {
  open: "success",
  draft: "muted",
  merged: "merged",
  closed: "danger",
};
const CI_TONE: Record<string, string> = {
  pass: "success",
  running: "warning",
  fail: "danger",
  unknown: "muted",
};

/**
 * The pibarm statusline footer: project / model / context on the left,
 * repo / forge / CI status on the right, with colour-coded PR & CI.
 * @category status
 */
export function StatusLine({
  project = "pibarm",
  model = "anthropic/Sonnet 4.5",
  context = 37,
  branch = "main",
  dirty = 2,
  pr = { num: 12, state: "open" },
  ci = "pass",
  variant = "panel",
  theme = "dark",
  className = "",
  ...rest
}: StatusLineProps) {
  const prTone = pr ? PR_TONE[pr.state] || "muted" : "muted";
  const ciTone = CI_TONE[ci] || "muted";
  const bare = variant === "bare" ? "pib-statusline--bare" : "";
  const light = theme === "light" ? "pib-statusline--light" : "";
  const cls = `pib-statusline ${bare} ${light} ${className}`.replace(/\s+/g, " ").trim();

  return (
    <div className={cls} {...rest}>
      <div className="pib-statusline__grp">
        <span className="pib-statusline__seg pib-statusline__proj">
          <Icon name="sandwich" size={14} />{` ${project}`}
        </span>
        <span className="pib-statusline__seg pib-statusline__dim">
          <Icon name="bot" size={14} /> <span className="pib-statusline__val">{model}</span>
        </span>
        <span className="pib-statusline__seg pib-statusline__dim">
          <Icon name="gauge" size={14} />{` ctx ${context}%`}
        </span>
      </div>
      <div className="pib-statusline__grp">
        <span className="pib-statusline__seg">
          <Icon name="git-branch" size={14} />{` ${branch}`}
          {dirty ? <span className="pib-statusline__dim">{` ±${dirty}`}</span> : null}
        </span>
        {pr && (
          <span className={`pib-statusline__seg pib-sl--${prTone}`}>
            <Icon name="git-pull-request" size={14} />{` #${pr.num}`}
          </span>
        )}
        <span className={`pib-statusline__seg pib-sl--${ciTone}`}>
          <Icon name="activity" size={14} /> CI
        </span>
      </div>
    </div>
  );
}
