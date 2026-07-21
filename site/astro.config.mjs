// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import { fileURLToPath } from "node:url";

// pibarm docs & marketing site. Static output; React only for the tabbed
// demo island (the scripted pi session + the WezTerm Butty).
//
// The design system (pibarm-ds) is consumed straight from source — no build
// step, no symlink. Runtime dependencies are pinned to the site's own copies so
// the package's dev dependencies can never be pulled into the graph alongside them.
const dsSrc = fileURLToPath(new URL("../packages/pibarm-ds/src", import.meta.url));
const siteDep = (p) => fileURLToPath(new URL(`./node_modules/${p}`, import.meta.url));

export default defineConfig({
  site: "https://pibarm.lmchn.xyz",
  integrations: [react()],
  vite: {
    resolve: {
      alias: {
        "pibarm-ds": dsSrc,
        lucide: siteDep("lucide"),
        react: siteDep("react"),
        "react-dom": siteDep("react-dom"),
      },
      dedupe: ["react", "react-dom"],
    },
  },
});
