import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { exportCurrentSessionToObsidian } from "../lib/obsidian-export.js";
import { getObsidianSettings } from "../lib/pibarm-settings.js";

export default function obsidianExtension(pi: ExtensionAPI) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let pendingCtx: ExtensionContext | undefined;

  async function exportNow(ctx: ExtensionContext) {
    const result = await exportCurrentSessionToObsidian(ctx);
    return `Exported ${result.entries} entries to ${result.path}`;
  }

  function runAutoExport(ctx: ExtensionContext) {
    if (running) {
      // An export is in flight; remember that another one is due so the final
      // turns of a session still get synced.
      pendingCtx = ctx;
      return;
    }
    running = true;
    exportCurrentSessionToObsidian(ctx)
      .catch((error) => ctx.ui.notify(`Obsidian export failed: ${(error as Error).message}`, "warning"))
      .finally(() => {
        running = false;
        if (pendingCtx) {
          const next = pendingCtx;
          pendingCtx = undefined;
          runAutoExport(next);
        }
      });
  }

  async function maybeAutoSync(ctx: ExtensionContext) {
    const settings = await getObsidianSettings(ctx);
    if (!settings.configured || !settings.autoSync) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => runAutoExport(ctx), settings.debounceMs);
  }

  pi.registerCommand("obsidian-status", {
    description: "Show pibarm Obsidian export settings",
    handler: async (_args, ctx) => {
      const settings = await getObsidianSettings(ctx);
      ctx.ui.notify([
        `vault: ${settings.vault || "(not configured)"}`,
        `basePath: ${settings.basePath}`,
        `autoSync: ${settings.autoSync}`,
        `debounceMs: ${settings.debounceMs}`,
        `includeAttachments: ${settings.includeAttachments}`,
      ].join("\n"), settings.configured ? "info" : "warning");
    },
  });

  pi.registerCommand("obsidian-export", {
    description: "Export the current Pi session to the configured Obsidian vault",
    handler: async (_args, ctx) => {
      try {
        ctx.ui.notify(await exportNow(ctx), "info");
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });

  pi.on("turn_end", async (_event, ctx) => maybeAutoSync(ctx));
  pi.on("session_compact", async (_event, ctx) => maybeAutoSync(ctx));
  pi.on("session_shutdown", () => {
    if (timer) clearTimeout(timer);
  });
}
