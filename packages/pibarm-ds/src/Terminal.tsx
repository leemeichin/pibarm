import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export interface TerminalProps extends HTMLAttributes<HTMLDivElement> {
  /** Window title. Rendered as HTML, so it may carry markup. */
  title?: string;
  /** Fixes the body height, in px. */
  height?: number | null;
  bodyStyle?: CSSProperties;
  className?: string;
  children?: ReactNode;
}

/**
 * Faux terminal window (macOS-style chrome) for showing pi sessions.
 * Compose the body with plain text plus helper spans:
 * <span className="slash">/plan</span>, .cmd, .dim, .ok, .warn, .err, .info.
 * @category docs
 */
export function Terminal({
  title = "pi — pibarm",
  height = null,
  bodyStyle,
  className = "",
  children,
  ...rest
}: TerminalProps) {
  const bodyStyles: CSSProperties = {
    ...(height ? { height: `${height}px`, maxHeight: `${height}px` } : {}),
    ...bodyStyle,
  };

  return (
    <div className={`pib-term ${className}`.trim()} {...rest}>
      <div className="pib-term__bar">
        <div className="pib-term__dots">
          <span className="pib-term__dot" style={{ background: "#e0685b" }} />
          <span className="pib-term__dot" style={{ background: "#e6b02c" }} />
          <span className="pib-term__dot" style={{ background: "#6fa84c" }} />
        </div>
        <span className="pib-term__title" dangerouslySetInnerHTML={{ __html: title }} />
      </div>
      <div className="pib-term__body" style={bodyStyles}>
        {children}
      </div>
    </div>
  );
}
