# Building with pibarm

pibarm is a terminal (TUI) tool for pi — it ships no web product. This system exists to build its
docs/marketing site and to show TUI-grounded UI on the web. Voice is technical, dry, warmly Northern:
sentence case everywhere, the product name always lowercase **pibarm**, commands keep their slash
(`/plan`, `/execute-plan worktree <name>`). No emoji, ever.

## Setup: no provider

There is **no** provider, theme context, or root wrapper. Import a component and render it — that's
all. Styling comes entirely from the stylesheet: link `styles.css` once (it `@import`s the tokens,
the self-hosted fonts, and the component CSS). Without it, components render as unstyled HTML.

```jsx
import { Button, Callout, Icon, StatusLine } from "pibarm-ds";

<section style={{ display: "grid", gap: "var(--space-4)" }}>
  <StatusLine branch="fix-flaky" dirty={3} pr={{ num: 128, state: "open" }} ci="running" />
  <Callout tone="warning" title="Plan mode is read-only">
    <code>edit</code> and <code>write</code> stay disabled until you approve the plan.
  </Callout>
  <Button variant="primary" leading={<Icon name="terminal" size={16} />}>Read the docs</Button>
</section>
```

## The styling idiom: tokens for your own layout, `pib-*` classes are the components' own

Style your own layout glue with the **CSS custom properties** — never hard-coded hex, px, or shadows.
There is no utility-class system (no Tailwind); reach for `var(--*)` in inline styles or your own CSS.

| Family | Real names |
|---|---|
| Surfaces | `--bg-page`, `--bg-page-warm`, `--surface-card`, `--surface-sunken`, `--surface-tint`, `--surface-code` (dark terminal ground) |
| Text | `--text-strong`, `--text-body`, `--text-muted`, `--text-gravy`, `--text-on-dark`, `--text-on-accent` |
| Brand & accents | `--accent` / `--accent-hover` (the orange dot), ramps `--orange-*`, `--navy-*`, `--cream-*`, `--sand-*`, `--bark-*`, and spring accents `--pea-*`, `--sky-*`, `--tomato-*`, `--mustard-*`, `--plum-*` |
| Status | `--status-success`, `--status-warning`, `--status-danger`, `--status-info`, `--status-merged`, `--status-muted` |
| Washes | `--wash-peach`, `--wash-sky`, `--wash-sage`, `--wash-blush`, `--wash-lilac` — faint watercolour section backgrounds |
| Type | `--font-display` (Zilla Slab), `--font-body` (IBM Plex Sans), `--font-mono` (JetBrains Mono); sizes `--fs-micro`…`--fs-4xl`; weights `--fw-regular`…`--fw-bold`; `--lh-*`, `--ls-*` |
| Space & shape | `--space-0`…`--space-24` (4px base), `--radius-xs`…`--radius-xl`, `--radius-pill`, `--border-hair`, `--shadow-xs`…`--shadow-lg`, `--shadow-terminal` |
| Motion | `--dur-fast` 120ms, `--dur-med`, `--dur-slow`, `--ease-out`, `--ease-bounce` |

The `pib-*` classes (`pib-btn`, `pib-card`, `pib-badge`, `pib-pill`, `pib-statusline`, `pib-term`,
`pib-code`, `pib-callout`, `pib-cmd`, `pib-kbd`) are **applied by the components themselves** — you
do not write them. The one exception is `Terminal`'s body, which you compose from plain text plus
helper spans: `.slash` (orange command), `.cmd` (prefixed with `$`), `.dim`, `.ok`, `.warn`, `.err`,
`.info`, and `.pib-term__caret` for the blinking caret.

## Icons

`<Icon name="…" />` takes a **fixed set** of names, typed as `IconName` — anything outside it is a
type error, so stick to the exported list (`ICON_NAMES`). Icons are bundled, not fetched: no CDN, no
`lucide.createIcons()` call. Common names: `terminal`, `git-branch`, `git-pull-request`, `sandwich`,
`bot`, `gauge`, `activity`, `layers`, `play`, `github`, `clipboard-list`, `sliders-horizontal`,
`bell`, `notebook-pen`, `check`, `circle`.

## Terminal-native forms

pibarm's real UI is a fixed-width mono grid — no radius, shadow, or gradient. Three components ship a
terminal-native form alongside their web form, and these are the source of truth for what the tool
actually renders: `Badge variant="term"`, `TaskPill variant="term"`, `StatusLine variant="bare"`. Put
them on `--surface-code`; on a light ground, wrap in `.pib-term-light` (or pass `StatusLine theme="light"`).
Status glyphs (`○ ● ✓ ! ±`, guillemets `‹ ›`) are literal mono characters, not icons.

## Where the truth lives

Read the stylesheets before styling anything: `styles.css` and its imports — `tokens/colors.css`,
`tokens/typography.css`, `tokens/spacing.css`, `tokens/base.css`, and `_ds_bundle.css` (every
component rule). Per-component API and examples: `components/<group>/<Name>/<Name>.prompt.md` and
`<Name>.d.ts`.
