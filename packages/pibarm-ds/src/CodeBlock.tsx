import { useState, type HTMLAttributes, type MouseEvent, type ReactNode } from "react";

export interface CodeBlockProps extends HTMLAttributes<HTMLDivElement> {
  /** Label shown in the header. */
  language?: string;
  /** The code. Ignored when children are supplied. */
  code?: string;
  /** Show the copy button. */
  copyable?: boolean;
  className?: string;
  /** Pre-formatted code, when you need markup (syntax highlighting) inside. */
  children?: ReactNode;
}

/**
 * Code block with language label and copy button.
 * @category docs
 */
export function CodeBlock({
  language = "bash",
  code = "",
  copyable = true,
  className = "",
  children,
  ...rest
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  // On the Astro site this component is never hydrated, so this handler never
  // runs — a delegated listener in the layout does the copying instead. It is
  // what makes the button work wherever React actually runs.
  const onCopy = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const text = code || e.currentTarget.closest(".pib-code")?.querySelector("code")?.textContent || "";
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className={`pib-code ${className}`.trim()} {...rest}>
      <div className="pib-code__head">
        <span className="pib-code__lang">{language}</span>
        {copyable && (
          <button className="pib-code__copy" type="button" data-code={code} onClick={onCopy}>
            {copied ? "copied ✓" : "copy"}
          </button>
        )}
      </div>
      <pre className="pib-code__pre"><code>{children ?? code}</code></pre>
    </div>
  );
}
