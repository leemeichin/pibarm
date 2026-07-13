import type { HTMLAttributes, ReactNode } from "react";

export type CalloutTone = "note" | "tip" | "warning" | "danger";

export interface CalloutProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: CalloutTone;
  /** Bold heading above the body. */
  title?: string | null;
  /** Overrides the tone's default glyph. */
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

const GLYPH: Record<CalloutTone, string> = {
  note: "ℹ",
  tip: "✓",
  warning: "▲",
  danger: "!",
};

/**
 * Documentation admonition.
 * @category docs
 */
export function Callout({
  tone = "note",
  title = null,
  icon = null,
  className = "",
  children,
  ...rest
}: CalloutProps) {
  return (
    <div className={`pib-callout pib-callout--${tone} ${className}`.trim()} {...rest}>
      <div
        className="pib-callout__ic"
        style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "15px" }}
      >
        {icon || GLYPH[tone]}
      </div>
      <div className="pib-callout__body">
        {title && <p className="pib-callout__title">{title}</p>}
        {children}
      </div>
    </div>
  );
}
