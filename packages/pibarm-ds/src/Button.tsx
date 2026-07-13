import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonOwnProps {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  /** Renders a <button> by default; pass "a" (with href) for a link. */
  as?: "button" | "a";
  /** Icon or adornment before the label. */
  leading?: ReactNode;
  /** Icon or adornment after the label. */
  trailing?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export type ButtonProps = ButtonOwnProps &
  Omit<
    ButtonHTMLAttributes<HTMLButtonElement> & AnchorHTMLAttributes<HTMLAnchorElement>,
    keyof ButtonOwnProps
  >;

/**
 * pibarm button. Mono-labelled, gently rounded, warm.
 * @category core
 */
export function Button({
  variant = "primary",
  size = "md",
  as = "button",
  leading,
  trailing,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const Tag = as as "button";
  const cls = `pib-btn pib-btn--${variant} pib-btn--${size} ${className}`.trim();

  return (
    <Tag className={cls} {...rest}>
      {leading}
      <span>{children}</span>
      {trailing}
    </Tag>
  );
}
