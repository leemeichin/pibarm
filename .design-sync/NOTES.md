# design-sync notes — pibarm

Repo-specific gotchas for future syncs. Read before re-running.

## The setup

- The design system is `packages/pibarm-ds` — React components over the pibarm token/component CSS.
  It is the **single implementation**: the site (`site/`) imports from it, and the old
  `site/src/lib/pibarm/*.astro` components were deleted in the same change.
- The site consumes the package **from source** via a Vite alias in `site/astro.config.mjs` (no build
  step, no symlink, no lockfile entry). `react`/`react-dom` are hard-aliased to `site/node_modules`
  so the package's own dev-time React can never dual-load and blow up hooks.
- Package managers are split on purpose: root is **bun**, `site/` is **npm**, `packages/pibarm-ds` is
  **npm**. Don't unify them into workspaces — the site's lockfile would be orphaned.

## Running the converter

```sh
npm run build --prefix packages/pibarm-ds     # tsc -> dist/*.js + dist/*.d.ts (the .d.ts tree is what the converter reads)
node .ds-sync/resync.mjs --config .design-sync/config.json \
  --node-modules packages/pibarm-ds/node_modules \
  --entry packages/pibarm-ds/dist/index.js --out ./ds-bundle \
  --remote .design-sync/.cache/remote-sync.json
```

- **`--entry` must be the path from the repo root** (`packages/pibarm-ds/dist/index.js`), NOT
  `./dist/index.js`. The converter derives the package root by walking up from `dirname(entry)`, so a
  cwd-relative `./dist/...` walks up to the REPO's package.json and it then reads the root `lib/` as
  the source dir and finds zero components.
- **`packages/pibarm-ds/node_modules/pibarm-ds` is a self-symlink (`ln -sfn .. node_modules/pibarm-ds`)
  and is gitignored — recreate it after a fresh clone or `npm ci`.** Without it the tokens don't ship.
  Reason: `copyTokens` only honours `cfg.tokensGlob` when `cfg.tokensPkg` is set, and it resolves that
  package as `join(nodeModules, tokensPkg)`. Our tokens live inside the DS package itself, so the
  package has to be resolvable from its own node_modules. Symptom if missing: `tokens/` in the bundle
  is empty, `styles.css` has 2 imports instead of 7, and every component renders unstyled.
- `cfg.tokensGlob` must be a **string**, not an array (the lib calls `.split('/')` on it).

## The global name — deliberate, don't "fix" it

The project was originally authored in the claude.ai/design SPA, whose namespace was
`window.PibarmDesignSystem_8a605e`. The converter normalizes any `globalName` to alphanumerics, so the
underscore **cannot** be reproduced — the bundle's global is now `PibarmDesignSystem8a605e`.

The pre-existing `ui_kits/pibarm-site/` (hand-authored, not reproducible from this repo) mounts from the
old name. Rather than rewrite its six .jsx files, `ui_kits/pibarm-site/index.html` carries a one-line
alias after the bundle `<script>`:

```html
<script>window.PibarmDesignSystem_8a605e = window.PibarmDesignSystem8a605e;</script>
```

**That file is not produced by the converter.** It is staged into `ds-bundle/ui_kits/pibarm-site/index.html`
by hand before upload, and `ds-bundle/` is wiped on every build — so **re-stage it after the final build
or the UI kit breaks**. (See "Re-sync risks".)

## Fonts and icons

- Fonts are **self-hosted**: `packages/pibarm-ds/fonts/` (32 woff2, latin + latin-ext; Zilla Slab,
  IBM Plex Sans, JetBrains Mono — all OFL) with a local `@font-face` sheet, wired via `cfg.extraFonts`.
  Regenerate with the Google Fonts css2 API if weights change.
- `packages/pibarm-ds/src/styles/tokens/fonts.css` still uses the Google Fonts `@import` **by design** — the site has a
  network; the sandbox designs render in may not. Both ship; local `@font-face` wins when the CDN is blocked.
  Validate prints `[FONT_REMOTE]` for this — informational, expected, not a regression.
- Icons are a **curated, tree-shaken set** (`packages/pibarm-ds/src/icons.ts`, ~36 icons). `Icon`'s `name`
  is typed as the `IconName` union derived from that map, so an unknown name is a type error rather than a
  silent blank. Never go back to lucide's `icons` barrel with a dynamic key — it defeats tree-shaking and
  drags all ~1600 icons into the bundle.
- **lucide 1.x ships no brand icons — there is no `github`.** The GitHub mark is hand-inlined in
  `icons.ts` (filled, not stroked; `FILLED_ICONS` drives that). Before this, `<Icon name="github" />` in the
  site nav rendered an *empty* `<svg>` — a real bug that shipped.

## Fixed along the way

- `.pib-badge--solid` only defined backgrounds for `accent`/`success`/`danger`, so `solid` + any of
  warning/info/merged/muted rendered **white text on a pale tint — invisible**. Completed the set in
  `components.css` using the `--status-*` mid-tones. The site never used `solid`, so it never hit this.

## Known render warns

None. The final validate is clean (0 warnings, 11/11 render). `[GRID_OVERFLOW]` on `StatusLine` and
`CommandRow` was resolved with `cfg.overrides.<Name>.cardMode = "column"` — they are genuinely full-width
components.

## Re-sync risks

- **The UI-kit alias file is the fragile bit.** It lives only in the design project and is re-staged by
  hand into `ds-bundle/` each sync. Forget it and the click-through prototype silently stops mounting.
  Consider rewriting the six .jsx files to the new global to retire this hack for good.
- **`guidelines/`, `ui_kits/`, `assets/`, `uploads/`, `SKILL.md` and `readme.md` in the project are
  hand-authored in the SPA and cannot be regenerated from this repo.** Never put them in a delete plan.
  The upload plan's deletes must stay scoped to what the converter actually produces.
- The project's `readme.md` (SPA-authored brand guide) and the converter's `README.md` now coexist —
  different files, different case. Both are useful; don't "dedupe" them without reading both.
- The site's fidelity oracle is a diff of `site/dist/` against a pre-change build. If you touch the DS
  components, rebuild the site and diff — React's serialization differs cosmetically from Astro's
  (no trailing `;` in style attrs, `&lt;` escaping in attribute values, `<!-- -->` between adjacent text
  nodes) but nothing else should move.
- Do **not** add a `client:*` directive to a DS component in the site. Astro strips the `<astro-slot>`
  wrapper only for non-hydrated components; hydrating one puts a real element inside the flex layouts in
  `components.css`. `site.css` carries an `astro-slot { display: contents }` insurance rule for that day.
