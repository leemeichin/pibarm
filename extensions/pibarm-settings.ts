import { createRequire } from "node:module";
import { join } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir, getSettingsListTheme, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Container,
  Input,
  type SettingItem,
  SettingsList,
  Text,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import {
  getPibarmSettings,
  mergePibarmSettings,
  type PibarmSettings,
  type PibarmSettingUpdate,
  readSettingsDocument,
  sanitizeBasePath,
  updatePibarmSettings,
} from "../lib/pibarm-settings.js";

const packageJson = createRequire(import.meta.url)("../package.json") as { version?: unknown };
if (typeof packageJson.version !== "string") throw new Error("pibarm package version is missing");
export const PIBARM_VERSION = packageJson.version;

export const PIBARM_SETTING_IDS = [
  "git.commitTrailer",
  "codeIntel.enabled",
  "codeIntel.autoInstall",
  "codeIntel.timeoutMs",
  "obsidian.vault",
  "obsidian.basePath",
  "obsidian.autoSync",
  "obsidian.debounceMs",
  "obsidian.includeAttachments",
  "butty.autoSpawn",
] as const;

type PibarmSettingId = (typeof PIBARM_SETTING_IDS)[number];

const SETTING_PATHS: Record<PibarmSettingId, readonly string[]> = {
  "git.commitTrailer": ["git", "commitTrailer"],
  "codeIntel.enabled": ["codeIntel", "enabled"],
  "codeIntel.autoInstall": ["codeIntel", "autoInstall"],
  "codeIntel.timeoutMs": ["codeIntel", "timeoutMs"],
  "obsidian.vault": ["obsidian", "vault"],
  "obsidian.basePath": ["obsidian", "basePath"],
  "obsidian.autoSync": ["obsidian", "autoSync"],
  "obsidian.debounceMs": ["obsidian", "debounceMs"],
  "obsidian.includeAttachments": ["obsidian", "includeAttachments"],
  "butty.autoSpawn": ["butty", "autoSpawn"],
};

export function commitTrailerInstruction(version = PIBARM_VERSION): string {
  return `When creating a Git commit, add this exact trailer as the final line of the commit message:\nCo-authored-by: 🥧 pibarm v${version}`;
}

export function applyCommitTrailerInstruction(systemPrompt: string, settings: PibarmSettings): string | undefined {
  if (settings.git?.commitTrailer === false) return;
  return `${systemPrompt}\n\n${commitTrailerInstruction()}`;
}

function booleanValue(value: boolean): string {
  return value ? "on" : "off";
}

function integerAtLeast(label: string, minimum: number) {
  return (input: string) => {
    const value = Number(input.trim());
    if (!Number.isInteger(value) || value < minimum)
      throw new Error(`${label} must be an integer of at least ${minimum}`);
    return String(value);
  };
}

function buildSettingItems(
  settings: PibarmSettings,
  edit: (
    title: string,
    currentValue: string,
    done: (value?: string) => void,
    validate?: (value: string) => string,
  ) => Component,
): SettingItem[] {
  const obsidian = settings.obsidian ?? {};
  const codeIntel = settings.codeIntel ?? {};
  return [
    {
      id: "git.commitTrailer",
      label: "Git commit trailer",
      description: `Add ${commitTrailerInstruction().split("\n").at(-1)} to commits created by the agent`,
      currentValue: booleanValue(settings.git?.commitTrailer !== false),
      values: ["on", "off"],
    },
    {
      id: "codeIntel.enabled",
      label: "Code intelligence",
      description: "Allow the deferred code_intel tool in trusted projects",
      currentValue: booleanValue(codeIntel.enabled !== false),
      values: ["on", "off"],
    },
    {
      id: "codeIntel.autoInstall",
      label: "Code intel auto-install",
      description: "Allow managed code-intelligence downloads when not offline",
      currentValue: booleanValue(codeIntel.autoInstall !== false),
      values: ["on", "off"],
    },
    {
      id: "codeIntel.timeoutMs",
      label: "Code intel timeout (ms)",
      description: "Maximum duration of one managed code-intelligence query",
      currentValue: String(codeIntel.timeoutMs ?? 300_000),
      submenu: (current, done) =>
        edit("Code intelligence timeout (ms)", current, done, integerAtLeast("Timeout", 1_000)),
    },
    {
      id: "obsidian.vault",
      label: "Obsidian vault",
      description: "Absolute, home-relative, or project-relative vault path; blank disables export",
      currentValue: typeof obsidian.vault === "string" && obsidian.vault ? obsidian.vault : "(not set)",
      submenu: (current, done) =>
        edit(
          "Obsidian vault path",
          current === "(not set)" ? "" : current,
          (value) => done(value || "(not set)"),
          (value) => value.trim(),
        ),
    },
    {
      id: "obsidian.basePath",
      label: "Obsidian base path",
      description: "Relative folder inside the configured vault",
      currentValue: obsidian.basePath || "Pi",
      submenu: (current, done) =>
        edit("Obsidian base path", current, done, (value) => sanitizeBasePath(value.trim()) || "Pi"),
    },
    {
      id: "obsidian.autoSync",
      label: "Obsidian auto-sync",
      description: "Export after turns and compaction",
      currentValue: booleanValue(obsidian.autoSync === true),
      values: ["on", "off"],
    },
    {
      id: "obsidian.debounceMs",
      label: "Obsidian debounce (ms)",
      description: "Delay before an automatic session export",
      currentValue: String(obsidian.debounceMs ?? 2_000),
      submenu: (current, done) => edit("Obsidian debounce (ms)", current, done, integerAtLeast("Debounce", 250)),
    },
    {
      id: "obsidian.includeAttachments",
      label: "Obsidian attachments",
      description: "Include supported session attachments in exports",
      currentValue: booleanValue(obsidian.includeAttachments !== false),
      values: ["on", "off"],
    },
    {
      id: "butty.autoSpawn",
      label: "Butty auto-spawn",
      description: "Route standard isolated subagents into visible Butty panes",
      currentValue: booleanValue(settings.butty?.autoSpawn === true),
      values: ["on", "off"],
    },
    {
      id: "save",
      label: "Save and close",
      description: "Atomically write changed values; unknown settings are preserved",
      currentValue: "save",
      values: ["save"],
    },
  ];
}

function settingUpdate(id: PibarmSettingId, value: string): PibarmSettingUpdate {
  const booleanIds = new Set<PibarmSettingId>([
    "git.commitTrailer",
    "codeIntel.enabled",
    "codeIntel.autoInstall",
    "obsidian.autoSync",
    "obsidian.includeAttachments",
    "butty.autoSpawn",
  ]);
  const numberIds = new Set<PibarmSettingId>(["codeIntel.timeoutMs", "obsidian.debounceMs"]);
  return {
    path: SETTING_PATHS[id],
    value: booleanIds.has(id)
      ? value === "on"
      : numberIds.has(id)
        ? Number(value)
        : id === "obsidian.vault" && value === "(not set)"
          ? ""
          : value,
  };
}

export default function pibarmSettingsExtension(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    const systemPrompt = applyCommitTrailerInstruction(event.systemPrompt, await getPibarmSettings(ctx));
    if (systemPrompt) return { systemPrompt };
  });

  pi.registerCommand("pibarm-settings", {
    description: "Edit global or trusted-project pibarm settings",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/pibarm-settings requires TUI mode", "error");
        return;
      }

      const selectedScope = await ctx.ui.select("pibarm settings scope", ["Global", "Project"]);
      if (!selectedScope) return;
      if (selectedScope === "Project" && !ctx.isProjectTrusted()) {
        ctx.ui.notify("Project settings require a trusted project", "error");
        return;
      }

      const globalPath = join(getAgentDir(), "settings.json");
      const projectPath = join(ctx.cwd, CONFIG_DIR_NAME, "settings.json");
      const path = selectedScope === "Global" ? globalPath : projectPath;

      try {
        const global = await readSettingsDocument(globalPath);
        const project = selectedScope === "Project" ? await readSettingsDocument(projectPath) : {};
        const settings = mergePibarmSettings(global, project, selectedScope === "Project");
        const changes = new Map<PibarmSettingId, PibarmSettingUpdate>();

        const save = await ctx.ui.custom<boolean>((tui, theme, _keybindings, done) => {
          const edit = (
            title: string,
            currentValue: string,
            finish: (value?: string) => void,
            validate: (value: string) => string = (value) => value,
          ) => {
            const input = new Input();
            input.setValue(currentValue);
            let error = "";
            input.onSubmit = (value) => {
              try {
                error = "";
                finish(validate(value));
              } catch (cause) {
                error = (cause as Error).message;
              }
            };
            input.onEscape = () => finish();
            return {
              render(width: number) {
                return [
                  ...wrapTextWithAnsi(theme.fg("accent", theme.bold(title)), width),
                  "",
                  ...input.render(width),
                  ...(error ? ["", ...wrapTextWithAnsi(theme.fg("error", error), width)] : []),
                  "",
                  theme.fg("dim", "Enter to apply · Esc to go back"),
                ];
              },
              invalidate: () => input.invalidate(),
              handleInput: (data: string) => input.handleInput(data),
            };
          };

          const items = buildSettingItems(settings, edit);
          const container = new Container();
          container.addChild(
            new Text(theme.fg("accent", theme.bold(`pibarm settings · ${selectedScope.toLowerCase()}`)), 1, 1),
          );
          const list = new SettingsList(
            items,
            Math.min(items.length, 15),
            getSettingsListTheme(),
            (rawId, value) => {
              if (rawId === "save") {
                done(true);
                return;
              }
              const id = rawId as PibarmSettingId;
              changes.set(id, settingUpdate(id, value));
            },
            () => done(false),
            { enableSearch: true },
          );
          container.addChild(list);
          return {
            render: (width: number) => container.render(width),
            invalidate: () => container.invalidate(),
            handleInput: (data: string) => {
              list.handleInput(data);
              tui.requestRender();
            },
          };
        });

        if (!save) return;
        await updatePibarmSettings(path, [...changes.values()]);
        ctx.ui.notify(
          changes.size
            ? `Saved ${changes.size} pibarm setting(s) to ${selectedScope.toLowerCase()} scope`
            : "No pibarm settings changed",
          "info",
        );
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });
}
