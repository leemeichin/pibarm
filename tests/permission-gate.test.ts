import { describe, expect, test } from "bun:test";
import { expandsOutsideProject, isInside } from "../extensions/permission-gate.js";

const ROOT = "/home/user/project";

describe("isInside", () => {
  test("accepts the root itself and nested paths", () => {
    expect(isInside(ROOT, ROOT)).toBe(true);
    expect(isInside(ROOT, `${ROOT}/src/main.ts`)).toBe(true);
    expect(isInside(ROOT, "src/main.ts")).toBe(true);
  });

  test("rejects absolute paths shorter than the root", () => {
    // Regression: slice()-based check treated any path shorter than the root as inside.
    expect(isInside(ROOT, "/etc/passwd")).toBe(false);
    expect(isInside(ROOT, "/tmp")).toBe(false);
  });

  test("rejects parent traversal and sibling prefixes", () => {
    expect(isInside(ROOT, `${ROOT}/../other`)).toBe(false);
    expect(isInside(ROOT, `${ROOT}-backup/file`)).toBe(false);
    expect(isInside(ROOT, "..")).toBe(false);
  });
});

describe("expandsOutsideProject", () => {
  test("flags commands whose only outside path is not the first token", () => {
    // Regression: only the first path token used to be checked.
    expect(expandsOutsideProject(`cp ${ROOT}/secrets.json /outside/exfil.json`, ROOT)).toBe(true);
  });

  test("flags short absolute paths", () => {
    expect(expandsOutsideProject("cat /etc/passwd", ROOT)).toBe(true);
  });

  test("allows commands that stay inside the project or tmp", () => {
    expect(expandsOutsideProject(`cat ${ROOT}/README.md`, ROOT)).toBe(false);
    expect(expandsOutsideProject("cat ./README.md", ROOT)).toBe(false);
    expect(expandsOutsideProject("cp ./a.txt /tmp/a.txt", ROOT)).toBe(false);
  });
});
