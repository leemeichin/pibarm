import type { HTMLAttributes, ReactNode } from "react";

export type BadgeTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "merged"
  | "accent"
  | "muted";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Tones mirror the pibarm TUI statusline colour mapping. */
  tone?: BadgeTone;
  /** Filled chip rather than tinted. */
  solid?: boolean;
  /** Show the leading status dot. */
  dot?: boolean;
  /** "term" renders the flat terminal-native form (no chip). */
  variant?: "pill" | "term";
  leading?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/**
 * Status badge.
 * @category status
 */
export function Badge({
  tone = "muted",
  solid = false,
  dot = false,
  variant = "pill",
  leading,
  className = "",
  children,
  ...rest
}: BadgeProps) {
  const cls =
    variant === "term"
      ? `pib-badge-term pib-badge-term--${tone} ${className}`.trim()
      : `pib-badge pib-badge--${tone} ${solid ? "pib-badge--solid" : ""} ${className}`
          .replace(/\s+/g, " ")
          .trim();

  return (
    <span className={cls} {...rest}>
      {dot && <span className="pib-badge__dot" />}
      {leading}
      {children}
    </span>
  );
}
