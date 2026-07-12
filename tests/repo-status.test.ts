import { describe, expect, test } from "bun:test";
import { firstJiraTicket } from "../extensions/repo-status.js";

describe("firstJiraTicket", () => {
  test("finds real Jira keys in branch names and commit text", () => {
    expect(firstJiraTicket("feature/PROJ-123-add-caching")).toBe("PROJ-123");
    expect(firstJiraTicket("Fix login\n\nRelates to ABC-9")).toBe("ABC-9");
  });

  test("ignores technical acronyms that look like ticket keys", () => {
    // Regression: the footer displayed "UTF-8" as the Jira ticket.
    expect(firstJiraTicket("Normalize UTF-8 handling")).toBeUndefined();
    expect(firstJiraTicket("Use SHA-256 for hashing")).toBeUndefined();
    expect(firstJiraTicket("Dates are ISO-8601 now")).toBeUndefined();
  });

  test("skips acronyms but still finds a later real key", () => {
    expect(firstJiraTicket("SHA-256 change for PLAT-42")).toBe("PLAT-42");
  });
});
