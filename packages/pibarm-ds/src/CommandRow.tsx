import type { HTMLAttributes, ReactNode } from "react";

export interface CommandRowProps extends HTMLAttributes<HTMLDivElement> {
  /** The command itself, e.g. "/execute-plan". */
  name: string;
  /** Argument spec shown after the name, e.g. "worktree <name>". */
  args?: string | null;
  /** Rendered at the end of the name row — typically a <Badge />. */
  trailing?: ReactNode;
  className?: string;
  /** The description. */
  children?: ReactNode;
}

/**
 * A slash-command reference row: name + description.
 * @category docs
 */
export function CommandRow({
  name,
  args = null,
  trailing,
  className = "",
  children,
  ...rest
}: CommandRowProps) {
  return (
    <div className={`pib-cmd ${className}`.trim()} {...rest}>
      <div className="pib-cmd__name">
        <span className="pib-cmd__slash">{`${name}${args ? " " + args : ""}`}</span>
        {trailing}
      </div>
      <div className="pib-cmd__desc">{children}</div>
    </div>
  );
}
