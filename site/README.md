# pibarm docs site

Static documentation + demos for pibarm's commands, tools, and skills, hosted on
Cloudflare Workers (assets-only Worker, no build step).

## Local preview

```bash
cd site
npx wrangler dev
```

## Deploy

```bash
cd site
npx wrangler deploy
```

First deploy will prompt for a Cloudflare login and publish to
`pibarm-docs.<account>.workers.dev`. Add a custom domain later via the
Cloudflare dashboard or a `routes` entry in `wrangler.jsonc`.

## Layout

```
site/
├── wrangler.jsonc     # Worker config (assets-only)
└── public/            # everything served as-is
    ├── index.html     # overview + quick start
    ├── commands.html  # slash command reference
    ├── tools.html     # LLM tool reference
    ├── skills.html    # skill catalogue
    ├── demos.html     # interactive TUI simulations
    ├── 404.html
    ├── styles.css
    └── site.js
```

The demos are browser-side simulations of pi's TUI widgets — no real agent
runs in the browser. Content is maintained by hand from the top-level
`README.md`; keep the two in sync when commands/tools change.
