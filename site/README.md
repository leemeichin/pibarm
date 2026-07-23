# pibarm site

The documentation & marketing site for **pibarm** — a set of [pi](https://github.com/leemeichin/pibarm) extensions and skills for planning before editing, isolating risky work in git worktrees, and watching agents work in tmux or Zellij.

Built with [Astro](https://astro.build). Ships as a static site with near-zero JavaScript — React is used only for the tabbed, animated demo section on the home page. It is the production implementation of the `ui_kits/pibarm-site` prototype from the pibarm design system (see `../project`).

## Develop

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output → dist/
npm run preview  # serve the built dist/
```

## Deploy

Wrangler deploys `dist/` as Cloudflare Workers static assets at
[`pibarm.lmchn.xyz`](https://pibarm.lmchn.xyz):

```bash
npx wrangler login # once per machine
npm run deploy
```

Pushes to `main` deploy through GitHub Actions. The repository only stores the
`OP_SERVICE_ACCOUNT_TOKEN` secret; the workflow loads `CLOUDFLARE_API_TOKEN`
and `CLOUDFLARE_ACCOUNT_ID` from matching credential items in the `pibarm`
1Password vault.

## Structure

```
src/
  layouts/Base.astro        top nav (wordmark, screen links, GitHub) + footer
  pages/
    index.astro             Home — hero, features, tabbed demos
    docs.astro              Docs — sticky sidebar + command reference
  components/
    Demos.jsx               React island: realistic agent-flow use cases
    AgentPanes.jsx          native tmux-pane transcript replay
  data/site.ts              feature and command reference data
  styles/
    global.css              entry point (@imports the design system, then site.css)
    site.css                page layout + responsive rules
public/assets/              pie-logo.png, pie-mark.png, readme-banner.png
```

The design system itself — the components **and** the token/component CSS — lives in
[`packages/pibarm-ds`](../packages/pibarm-ds), not here.

## Component library — `pibarm-ds`

Real, importable React components. Astro renders them at build time (no `client:*`
directive, so no framework JS ships), and named slots map to props:

```astro
---
import { Button, Icon, StatusLine } from "pibarm-ds";
---
<Button variant="primary" size="lg">
  <Icon slot="leading" name="terminal" size={16} />
  Read the docs
</Button>
```

The site resolves `pibarm-ds` from source through Vite aliases in `astro.config.mjs` — there is
no separate design-system build or install step.

**Don't add a `client:*` directive to a design-system component.** Astro only strips its
`<astro-slot>` wrapper for non-hydrated components; hydrating one puts a real element inside the
flex layouts in the DS CSS.

| Component | Notes |
|-----------|-------|
| `Button` | `variant` primary/secondary/ghost/danger · `size` sm/md/lg · `as="a"` for links · `leading`/`trailing` slots |
| `Card` | `eyebrow`, `title`, `accent`, `interactive` · `icon`/default slots |
| `Badge` | `tone` success/warning/danger/info/merged/accent/muted · `dot` · `variant="term"` |
| `TaskPill` | the `‹ ○ 1 · inspect auth ›` task-widget pill · `variant="term"` |
| `StatusLine` | the TUI statusline footer · `theme` dark/light · `variant` panel/bare |
| `Terminal` | faux terminal window; compose the body with `.cmd`/`.dim`/`.ok`/`.slash` spans |
| `Callout` | admonition · `tone` note/tip/warning/danger |
| `CodeBlock` | language label + copy button (delegated listener in `Base.astro`, since the component isn't hydrated) |
| `CommandRow` | slash-command reference row · `trailing` slot for a badge |
| `Kbd` | keyboard key cap |
| `Icon` | Lucide icon rendered to inline SVG **at build time** (no CDN, no runtime JS) · `name` is typed to a curated set |

The home page's `Demos` React island switches between three realistic agent workflows. `AgentPanes` replays the dedicated `pibarm-agents` tmux window using the same two-over-one tiled layout and transcript syntax emitted by `scripts/agent-render.mjs`; everything else is static Astro.

## Substitutions (carried over from the design system)

- **Fonts** — the banner wordmark is a bespoke slab; **Zilla Slab** stands in. The site loads the three families from Google Fonts; the design system ships self-hosted copies (`packages/pibarm-ds/fonts/`). Body is IBM Plex Sans, mono is JetBrains Mono.
- **Icons** — the TUI's Nerd Font glyphs can't ship on the web, so **Lucide** stands in (rendered to static SVG at build). Lucide ships no brand icons, so the GitHub mark is hand-inlined.
- **Logo** — the wordmark is live type (orange `i` dot); only the pie mascot (`pie-logo.png`) is an image.

## Source & credit

Grounded in [the pibarm repository](../) (README, `lib/task-widget.ts`, `lib/agent-runner.ts`, `extensions/repo-status.ts`) and the pibarm design system in `packages/pibarm-ds` (synced to Claude Design). Explore the repo for deeper implementation detail.

The demos mirror a captured `pi` + tmux session; they replay its terminal shape and output in the browser rather than running visitor-funded agents.
