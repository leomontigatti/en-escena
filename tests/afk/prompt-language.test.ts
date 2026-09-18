import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// PR #1014 was opened with an all-Spanish body and #1019's implement-pr round
// committed a Spanish subject, which under COMMIT_MESSAGES squash-merges lands
// in master's history. Neither agent was told: the only language cue a prompt
// gave was the issue body and a commit history that is mostly Spanish. Every
// prompt whose agent writes prose for the PR or for a commit now carries the
// rule itself, so the convention does not depend on the precedent the agent
// happens to read.
const PROMPTS_THAT_WRITE_PROSE = [
  "agent-write-pr",
  "agent-write-prd-pr",
  "agent-implement",
  "agent-implement-prd",
  "agent-implement-pr",
  "agent-review",
  "agent-update-branch",
];

describe.each(PROMPTS_THAT_WRITE_PROSE)("%s/prompt.md", (prompt) => {
  const source = readFileSync(`.sandcastle/${prompt}/prompt.md`, "utf8");

  it("names English as the language of the prose it asks for", () => {
    expect(source).toMatch(/English/);
  });

  it("points at the standard that decides it rather than restating it", () => {
    expect(source).toMatch(
      /`\.sandcastle\/CODING_STANDARDS\.md` § Code Language/,
    );
  });

  it("names the backtick exception, so Spanish data survives", () => {
    expect(source).toMatch(/backticks/);
  });
});
