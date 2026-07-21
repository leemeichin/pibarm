import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { initialPibarmTools, searchPibarmToolGroups } from "../lib/tool-policy.js";

const SEARCH_PARAMS = Type.Object({
  query: Type.String({ description: "Capability or task to find tools for" }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 7, description: "Maximum matching groups. Defaults to 3" })),
});

export default function toolSearch(pi: ExtensionAPI) {
  pi.registerTool({
    name: "search_tools",
    label: "Search Tools",
    description: "Search for and enable registered pibarm tools relevant to a task.",
    promptSnippet: "Search for additional pibarm tools when the active tools cannot perform the task",
    promptGuidelines: [
      "Use search_tools when a task needs a capability that is not active; search before claiming it is unavailable.",
    ],
    parameters: SEARCH_PARAMS,
    async execute(_toolCallId, params) {
      const groups = searchPibarmToolGroups(params.query, params.limit);
      if (!groups.length) {
        return {
          content: [{ type: "text", text: `No tool groups found for: ${params.query}` }],
          details: { groups: [], added: [] },
        };
      }

      const registered = new Set(pi.getAllTools().map((tool) => tool.name));
      const active = pi.getActiveTools();
      const matches = groups.flatMap((group) => [...group.tools]).filter((name) => registered.has(name));
      const added = matches.filter((name) => !active.includes(name));
      pi.setActiveTools([...new Set([...active, ...added])]);

      return {
        content: [
          {
            type: "text",
            text: added.length
              ? `Loaded ${groups.map((group) => group.name).join(", ")}: ${added.join(", ")}`
              : `Matching tools already active: ${matches.join(", ")}`,
          },
        ],
        details: { groups: groups.map((group) => group.name), added },
      };
    },
  });

  pi.on("session_start", () => pi.setActiveTools(initialPibarmTools(pi.getActiveTools())));
}
