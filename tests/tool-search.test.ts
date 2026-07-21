import { describe, expect, test } from "bun:test";
import toolSearch from "../extensions/tool-search.js";
import { initialPibarmTools, searchPibarmToolGroups } from "../lib/tool-policy.js";

const names = (query: string) => searchPibarmToolGroups(query).flatMap((group) => [...group.tools]);

describe("lazy tool policy", () => {
  test("keeps core and third-party tools while deferring specialized pibarm tools", () => {
    expect(
      initialPibarmTools([
        "read",
        "question",
        "elicit_plan_questions",
        "todo_list",
        "search_tools",
        "repo_status",
        "forge_prs",
        "butty_spawn",
        "third_party_tool",
      ]),
    ).toEqual(["read", "question", "elicit_plan_questions", "todo_list", "search_tools", "third_party_tool"]);
  });

  test("finds complete lifecycle groups from task language", () => {
    expect(names("review pull request checks")).toEqual(
      expect.arrayContaining(["forge_pr_status", "forge_ci_status", "watch_agent"]),
    );
    expect(names("visible wezterm panes")).toEqual(
      expect.arrayContaining(["butty_spawn", "butty_capture", "butty_join", "butty_kill"]),
    );
    expect(names("call an MCP server tool")).toEqual(
      expect.arrayContaining(["mcporter_list", "mcporter_call", "mcporter_resource"]),
    );
  });

  test("starts small and adds matched tools without removing active tools", async () => {
    const all = [
      "read",
      "question",
      "search_tools",
      "forge_status",
      "forge_prs",
      "forge_pr_status",
      "forge_ci_status",
      "forge_tickets",
    ];
    let active = [...all];
    let search: any;
    let start: (() => void) | undefined;
    const pi = {
      registerTool(tool: any) {
        search = tool;
      },
      on(event: string, handler: () => void) {
        if (event === "session_start") start = handler;
      },
      getAllTools: () => all.map((name) => ({ name })),
      getActiveTools: () => active,
      setActiveTools(names: string[]) {
        active = names;
      },
    };

    toolSearch(pi as never);
    start?.();
    expect(active).toEqual(["read", "question", "search_tools"]);

    const result = await search.execute("search", { query: "pull request review" });
    expect(active).toEqual(expect.arrayContaining(["read", "question", "search_tools", "forge_pr_status"]));
    expect(result.details.added).toContain("forge_pr_status");
  });
});
