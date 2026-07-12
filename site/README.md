# pibarm site

The documentation & marketing site for **pibarm** — a set of [pi](https://github.com/leemeichin/pibarm) extensions and skills for planning before editing, isolating risky work in git worktrees, and watching agents work in WezTerm.

Built with [Astro](https://astro.build). Ships as a static site with near-zero JavaScript — React is used only for the two animated demo islands. It is the production implementation of the `ui_kits/pibarm-site` prototype from the pibarm design system (see `../project`).

## Develop

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output → dist/
npm run preview  # serve the built dist/
```

## Structure

```
src/
  layouts/Base.astro        top nav (wordmark, screen links, GitHub) + footer
  pages/
    index.astro             Home — hero, feature grid, Matrix band
    docs.astro              Docs — sticky sidebar + command reference
    demo.astro              Demo — the two animated simulations
  components/
    PiSession.jsx           React island: scripted /plan → /execute-plan session
    Matrix.jsx              React island: WezTerm multi-pane orchestration
  data/site.ts              features, command list, session script (typed)
  lib/pibarm/               the design-system component library (see below)
  styles/
    global.css              entry point (@imports the rest)
    tokens/                 CSS custom properties (colors, type, spacing, fonts, base)
    components.css          all component styles (shipped globally)
    site.css                page layout + responsive rules
public/assets/              pie-logo.png, pie-mark.png, readme-banner.png
```

## Component library — `src/lib/pibarm/`

Real, importable Astro components ported 1:1 from the design system. Import what you need:

```astro
---
import { Button, StatusLine, TaskPill, Terminal } from "../lib/pibarm";
// or individually:
import Button from "../lib/pibarm/Button.astro";
---
<Button variant="primary" size="lg">Read the docs</Button>
```

| Component | Notes |
|-----------|-------|
| `Button` | `variant` primary/secondary/ghost/danger · `size` sm/md/lg · `as="a"` for links · `leading`/`trailing` slots |
| `Card` | `eyebrow`, `title`, `accent`, `interactive` · `icon`/default slots |
| `Badge` | `tone` success/warning/danger/info/merged/accent/muted · `dot` · `variant="term"` |
| `TaskPill` | the `‹ ○ 1 · inspect auth ›` task-widget pill · `variant="term"` |
| `StatusLine` | the TUI statusline footer · `theme` dark/light · `variant` panel/bare |
| `Terminal` | faux terminal window; compose the body with `.cmd`/`.dim`/`.ok`/`.slash` spans |
| `Callout` | admonition · `tone` note/tip/warning/danger |
| `CodeBlock` | language label + copy button (small vanilla script) |
| `CommandRow` | slash-command reference row · `trailing` slot for a badge |
| `Kbd` | keyboard key cap |
| `Icon` | Lucide icon rendered to inline SVG **at build time** (no CDN, no runtime JS) |

The two animated demo pieces (`PiSession`, `Matrix`) live in `src/components/` as React islands because they are stateful animations; everything else is static Astro.

## Substitutions (carried over from the design system)

- **Fonts** — the banner wordmark is a bespoke slab; **Zilla Slab** stands in (via Google Fonts). Body is IBM Plex Sans, mono is JetBrains Mono.
- **Icons** — the TUI's Nerd Font glyphs can't ship on the web, so **Lucide** stands in (rendered to static SVG at build).
- **Logo** — the wordmark is live type (orange `i` dot); only the pie mascot (`pie-logo.png`) is an image.

## Source & credit

Grounded in [`leemeichin/pibarm`](https://github.com/leemeichin/pibarm) (README, `lib/task-widget.ts`, `extensions/matrix.ts`, `extensions/repo-status.ts`) and the pibarm design system exported from Claude Design. Explore the repo for deeper implementation detail.

The two demos are cosmetic recreations of TUI output, not a real pi runtime.
