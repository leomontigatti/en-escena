import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// #742's decomposition shipped six sub-issues whose bodies carried a visible
// `\n` in mid-sentence, because the prompt used to instruct "Embed newlines as
// \n" and the model obliged with the two literal characters. Nothing downstream
// undid it: `jq -r` emits the backslash and `printf '%s'` passes it through, so
// it reached the reader. The prompt no longer asks for it; the schema normalises
// it regardless, since a future producer could escape on its own initiative.
import { toIssuesSchema } from "../../.sandcastle/agent-to-issues/output.mjs";

const PROMPT_PATH = ".sandcastle/agent-to-issues/prompt.md";

function parseSlice(whatToBuild: string) {
  const result = toIssuesSchema.parse({
    slices: [
      {
        title: "Slice",
        whatToBuild,
        acceptanceCriteria: ["Tests cover the new behaviour"],
      },
    ],
  });

  return result.slices[0]!.whatToBuild;
}

describe("toIssuesSchema", () => {
  it("turns an escaped paragraph break into a real one", () => {
    expect(parseSlice("First paragraph.\\n\\nSecond paragraph.")).toBe(
      "First paragraph.\n\nSecond paragraph.",
    );
  });

  it("turns a single escaped break into a real one", () => {
    expect(parseSlice("One line.\\nNext line.")).toBe("One line.\nNext line.");
  });

  it("leaves prose that already uses real newlines alone", () => {
    const prose = "First paragraph.\n\nSecond paragraph.";

    expect(parseSlice(prose)).toBe(prose);
  });

  it("leaves prose with no line breaks alone", () => {
    expect(parseSlice("A single paragraph.")).toBe("A single paragraph.");
  });

  it("still rejects an empty slice list", () => {
    expect(() => toIssuesSchema.parse({ slices: [] })).toThrow();
  });

  it("still rejects a slice with no acceptance criteria", () => {
    expect(() =>
      toIssuesSchema.parse({
        slices: [
          { title: "Slice", whatToBuild: "Prose.", acceptanceCriteria: [] },
        ],
      }),
    ).toThrow();
  });
});

describe("the to-issues prompt", () => {
  it("does not ask the model to escape its newlines", () => {
    const prompt = readFileSync(PROMPT_PATH, "utf8");

    expect(prompt).not.toContain("Embed newlines as");
  });
});
