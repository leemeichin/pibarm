export const PIBARM_TOOL_GROUPS = [
  {
    name: "repository",
    description: "repository and git status, branch, dirty files, pull request, and CI summary",
    tools: ["repo_status"],
  },
  {
    name: "forge",
    description: "GitHub or SourceHut pull requests, patches, reviews, checks, CI builds, issues, and tickets",
    tools: ["forge_status", "forge_prs", "forge_pr_status", "forge_ci_status", "forge_tickets"],
  },
  {
    name: "mcp",
    description: "MCP and mcporter external servers, resources, tool discovery, and tool calls",
    tools: ["mcporter_list", "mcporter_call", "mcporter_resource"],
  },
  {
    name: "code-intelligence",
    description: "semantic definitions, references, hover information, symbols, diagnostics, LSP, and language servers",
    tools: ["code_intel"],
  },
  {
    name: "delegation",
    description: "headless subagents, parallel or multi-model research, review, planning, and verification",
    tools: ["run_subagent", "run_subagents"],
  },
  {
    name: "worktree",
    description: "isolated git worktree branches, safe implementation, diff review, cleanup, and worktree agents",
    tools: ["create_git_worktree", "summarize_worktree_diff", "remove_git_worktree", "run_worktree_agent"],
  },
  {
    name: "butty",
    description: "Butty visible WezTerm agent panes, tabs, splits, capture, join, focus, list, and cleanup",
    tools: ["butty_spawn", "butty_attach", "butty_capture", "butty_join", "butty_list", "butty_kill"],
  },
  {
    name: "watcher",
    description: "watch and poll pull request reviews, comments, CI checks, or other external changes",
    tools: ["watch_agent"],
  },
] as const;

const DEFERRED_TOOLS = new Set<string>(PIBARM_TOOL_GROUPS.flatMap((group) => [...group.tools]));

export function initialPibarmTools(toolNames: string[]) {
  return [...new Set(toolNames.filter((name) => !DEFERRED_TOOLS.has(name)))];
}

export function searchPibarmToolGroups(query: string, limit = 3) {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 1);

  return PIBARM_TOOL_GROUPS.map((group) => ({
    ...group,
    score: terms.reduce(
      (score, term) => score + (`${group.name} ${group.description} ${group.tools.join(" ")}`.includes(term) ? 1 : 0),
      0,
    ),
  }))
    .filter((group) => group.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
