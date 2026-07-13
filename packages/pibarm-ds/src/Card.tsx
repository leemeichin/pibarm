import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Small mono label above the title. */
  eyebrow?: string;
  title?: string;
  /** Sand border + accent bar. */
  accent?: boolean;
  /** Lifts on hover. */
  interactive?: boolean;
  /** Rendered above the eyebrow — typically an <Icon />. */
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/**
 * Content card with optional eyebrow/title and accent bar.
 * @category core
 */
export function Card({
  eyebrow,
  title,
  accent = false,
  interactive = false,
  icon,
  className = "",
  children,
  ...rest
}: CardProps) {
  const cls = `pib-card ${accent ? "pib-card--accent" : ""} ${
    interactive ? "pib-card--interactive" : ""
  } ${className}`
    .replace(/\s+/g, " ")
    .trim();

  return (
    <div className={cls} {...rest}>
      {icon}
      {eyebrow && <p className="pib-card__eyebrow">{eyebrow}</p>}
      {title && <h3 className="pib-card__title">{title}</h3>}
      <div className="pib-card__body">{children}</div>
    </div>
  );
}
