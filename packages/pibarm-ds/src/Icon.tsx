import type { CSSProperties, HTMLAttributes } from "react";
import { FILLED_ICONS, ICONS, type IconName } from "./icons.js";

export interface IconProps extends Omit<HTMLAttributes<HTMLSpanElement>, "color"> {
  /** Icon to render. See ICON_NAMES for the full set. */
  name: IconName;
  /** Rendered box, in px. */
  size?: number;
  strokeWidth?: number;
  /** Any CSS colour. Defaults to the surrounding text colour. */
  color?: string;
  className?: string;
}

/**
 * Lucide icon, rendered to inline SVG.
 * Substitute for the TUI's Nerd Font glyphs (flagged in the design system).
 * No CDN, no client JS — the SVG is emitted straight into the markup.
 * @category core
 */
export function Icon({
  name,
  size = 16,
  strokeWidth = 2,
  color = "currentColor",
  className = "",
  ...rest
}: IconProps) {
  const node = ICONS[name];
  const filled = FILLED_ICONS.has(name);

  let inner = "";
  for (const child of node ?? []) {
    const [tag, attrs] = child;
    const a = Object.entries(attrs || {})
      .map(([k, v]) => `${k}="${v}"`)
      .join(" ");
    inner += `<${tag} ${a}></${tag}>`;
  }

  const paint = filled
    ? `fill="currentColor" stroke="none"`
    : `fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ${paint}>${inner}</svg>`;

  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: `${size}px`,
    height: `${size}px`,
    color,
    flex: "none",
  };

  return (
    <span
      className={`lucide ${className}`.trim()}
      style={style}
      {...rest}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
