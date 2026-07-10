import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function parseReviewTarget(args: string) {
  const trimmed = args.trim();
  if (!trimmed) return undefined;
  const first = trimmed.split(/\s+/)[0] ?? "";
  const url = first.match(/https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/(\d+)/i);
  if (url?.[1]) return url[1];
  const hash = first.match(/^#?(\d+)$/);
  if (hash?.[1]) return hash[1];
  return first;
}

async function githubContext(pi: ExtensionAPI, cwd: string, target: string | undefined) {
  const remote = await pi.exec("git", ["-C", cwd, "remote", "get-url", "origin"], { timeout: 10000 }).catch(() => undefined);
  if (!remote?.stdout || !/github\.com[:/]/i.test(remote.stdout)) return undefined;

  const selector = target ? shellQuote(target) : "";
  const command = `cd ${shellQuote(cwd)} && gh pr view ${selector} --json number,url,headRefName,headRefOid,baseRefName,title 2>/dev/null`;
  const pr = await pi.exec("bash", ["-lc", command], { timeout: 15000 }).catch(() => undefined);
  if (pr?.code !== 0 || !pr?.stdout?.trim()) return { remote: remote.stdout.trim() };
  try {
    return { remote: remote.stdout.trim(), pr: JSON.parse(pr.stdout) as { number?: number; url?: string; headRefName?: string; headRefOid?: string; baseRefName?: string; title?: string } };
  } catch {
    return { remote: remote.stdout.trim() };
  }
}

function reviewPrompt(target: string | undefined, gh: Awaited<ReturnType<typeof githubContext>>) {
  const pr = gh?.pr;
  const targetText = pr?.number ? `PR #${pr.number} (${pr.url})` : target ? `review target ${target}` : "the PR/patch linked to the current branch";
  const githubInline = pr?.number ? `

GitHub inline review instructions:
- This repo is on GitHub and the PR is #${pr.number}.
- Review the diff with \`gh pr diff ${pr.number}\` and inspect files locally as needed.
- For each actionable finding with a clear changed-line location, post an inline PR comment instead of only reporting it in chat.
- Use the PR head SHA \`${pr.headRefOid ?? "$(gh pr view --json headRefOid -q .headRefOid)"}\` as \`commit_id\`.
- Inline comment command shape:
  \`gh api --method POST repos/{owner}/{repo}/pulls/${pr.number}/comments -f body='...' -f commit_id='${pr.headRefOid ?? "HEAD_SHA"}' -f path='path/to/file' -F line=123 -f side=RIGHT\`
- Keep comments concise and actionable. Do not post style nits unless they affect correctness, tests, security, or maintainability.
- If a finding cannot be tied to a changed line, include it in the final chat summary instead.
- If there are no findings, do not post PR comments; summarize that no actionable findings were found.` : "";

  return `Review ${targetText}.

Use the pr-review skill. Identify the forge with forge_status/repo_status. Check PR status and CI with forge_pr_status and forge_ci_status. Inspect the diff and run the smallest relevant local checks.

For GitHub PRs, publish actionable review findings as inline pull-request comments when the PR/branch is identifiable. For non-GitHub forges, or when inline comment placement is not possible, report concise actionable findings in chat with file paths and line references.${githubInline}`;
}

export default function reviewExtension(pi: ExtensionAPI) {
  pi.registerCommand("review", {
    description: "Review a PR/patch: /review [#number|url|branch]. GitHub findings are posted inline when possible.",
    handler: async (args, ctx) => {
      const target = parseReviewTarget(args);
      const gh = await githubContext(pi, ctx.cwd, target).catch(() => undefined);
      pi.sendUserMessage(reviewPrompt(target, gh));
    },
  });
}
