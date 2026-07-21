import { isAbsolute, relative } from "node:path";

export interface ProjectContextFile {
  path: string;
  content: string;
}

function isInside(root: string, path: string) {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function effectiveProjectContext(files: ProjectContextFile[], projectRoot?: string) {
  const inside = projectRoot ? files.filter((file) => isInside(projectRoot, file.path)) : [];
  const scoped = inside.length ? inside : files;
  const seen = new Set<string>();
  const unique: ProjectContextFile[] = [];

  for (let index = scoped.length - 1; index >= 0; index--) {
    const file = scoped[index]!;
    if (seen.has(file.content)) continue;
    seen.add(file.content);
    unique.unshift(file);
  }
  return unique;
}

export function filterSystemPromptContext(
  systemPrompt: string,
  files: ProjectContextFile[],
  effective: ProjectContextFile[],
) {
  const kept = new Set(effective);
  for (const file of files) {
    if (kept.has(file)) continue;
    const block = `<project_instructions path="${file.path}">\n${file.content}\n</project_instructions>\n\n`;
    systemPrompt = systemPrompt.replace(block, "");
  }
  return systemPrompt;
}
