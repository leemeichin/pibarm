// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// pibarm docs & marketing site. Static output; React only for the two
// animated demo islands (the scripted pi session + the WezTerm Matrix).
export default defineConfig({
  site: "https://pibarm.meichin.com",
  integrations: [react()],
});
