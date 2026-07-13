import type { HTMLAttributes, ReactNode } from "react";

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  className?: string;
  children?: ReactNode;
}

/**
 * Keyboard key cap.
 * @category core
 */
export function Kbd({ className = "", children, ...rest }: KbdProps) {
  return (
    <kbd className={`pib-kbd ${className}`.trim()} {...rest}>
      {children}
    </kbd>
  );
}
