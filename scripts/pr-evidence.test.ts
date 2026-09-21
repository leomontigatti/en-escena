import { describe, expect, test } from "vitest";

import {
  evidenceAssetName,
  evidenceAssetUrl,
  evidenceFileProblem,
  renderEvidenceMarkdown,
} from "./pr-evidence";

function asset(label: string) {
  const name = `pr-7-${label}.png`;

  return { label, name, url: evidenceAssetUrl("owner/repo", name) };
}

describe("PR evidence (#1115)", () => {
  test("names an asset after its PR and a URL-safe file stem", () => {
    expect(evidenceAssetName(1120, "/tmp/Search Bar_Before.PNG")).toBe(
      "pr-1120-search-bar-before.png",
    );
  });

  test("points at the asset on the evidence prerelease", () => {
    expect(evidenceAssetUrl("owner/repo", "pr-7-list-after.png")).toBe(
      "https://github.com/owner/repo/releases/download/pr-assets/pr-7-list-after.png",
    );
  });

  test("pairs before and after into a table row and leaves the rest below it", () => {
    const markdown = renderEvidenceMarkdown([
      asset("list-before"),
      asset("list-after"),
      asset("empty-state"),
    ]);

    expect(markdown.split("\n\n")).toEqual([
      [
        "| Before | After |",
        "| --- | --- |",
        `| ![list-before](${asset("list-before").url}) | ![list-after](${asset("list-after").url}) |`,
      ].join("\n"),
      `![empty-state](${asset("empty-state").url})`,
    ]);
  });

  test("prints a before with no after as a plain image, not half a row", () => {
    expect(renderEvidenceMarkdown([asset("list-before")])).toBe(
      `![list-before](${asset("list-before").url})`,
    );
  });

  test("refuses a video, which a release asset cannot show inline", () => {
    expect(evidenceFileProblem("/tmp/drag.mp4", () => true)).toContain(
      "Convert motion to a GIF",
    );
    expect(evidenceFileProblem("/tmp/drag.gif", () => true)).toBeUndefined();
    expect(evidenceFileProblem("/tmp/missing.png", () => false)).toBe(
      "No such file: /tmp/missing.png",
    );
  });
});
