import { describe, expect, test } from "vitest";

import { checkLabels, findLabelReferencesInSource } from "./check-labels";
import { parseLabelFile } from "./labels";

const filePath = ".github/workflows/example.yml";

function labelsIn(contents: string): string[] {
  return findLabelReferencesInSource({ contents, filePath }).map(
    (reference) => reference.label,
  );
}

describe("label references (#1116)", () => {
  test("reads the gh flag forms, quoted, bare and comma-separated", () => {
    expect(
      labelsIn(
        `gh issue edit "$N" --remove-label "agent:implement" --add-label 'agent:blocked'`,
      ),
    ).toEqual(["agent:implement", "agent:blocked"]);
    expect(labelsIn(`gh issue create --label needs-triage`)).toEqual([
      "needs-triage",
    ]);
    expect(labelsIn(`gh issue list --label=bug,chore`)).toEqual([
      "bug",
      "chore",
    ]);
  });

  test("reads a flag and its value split across an argv array", () => {
    expect(
      labelsIn(`gh([\n  "issue",\n  "--label",\n  "needs-triage",\n]);`),
    ).toEqual(["needs-triage"]);
  });

  test("reads workflow conditions and jq equality", () => {
    expect(
      labelsIn(`if: github.event.label.name == 'agent:to-issues'`),
    ).toEqual(["agent:to-issues"]);
    expect(
      labelsIn(`select(startswith("priority:") or . == "bug" or . == "chore")`),
    ).toEqual(["bug", "chore"]);
  });

  test("reads a prefixed label anywhere, since those names are never prose", () => {
    expect(
      labelsIn(`const RUN_LABELS = ["agent:in-progress", "wayfinder:map"];`),
    ).toEqual(["agent:in-progress", "wayfinder:map"]);
  });

  test("reports each reference once, with its line", () => {
    const references = findLabelReferencesInSource({
      contents: `name: x\n  --add-label "agent:review"`,
      filePath,
    });

    expect(references).toEqual([
      { filePath, label: "agent:review", lineNumber: 2 },
    ]);
  });

  // Each of these reads like a label to a naive grep and is not one.
  test("ignores variables, placeholders, families and pnpm scripts", () => {
    expect(labelsIn(`--add-label "$label"`)).toEqual([]);
    expect(labelsIn(`--label wayfinder:<type> ...`)).toEqual([]);
    expect(labelsIn(`the \`agent:*\` labels and \`priority:\``)).toEqual([]);
    expect(labelsIn(`run: pnpm agent:write-pr`)).toEqual([]);
    expect(labelsIn(`with appropriate \`--label\` filters`)).toEqual([]);
  });
});

describe("label check (#1116)", () => {
  test("fails a misspelled label", () => {
    const violations = checkLabels({
      files: [
        {
          contents: `--add-label "agent:implemnt"\n--add-label "agent:blocked"`,
          filePath,
        },
      ],
      known: ["agent:blocked"],
    });

    expect(violations).toEqual([
      { filePath, label: "agent:implemnt", lineNumber: 1 },
    ]);
  });

  test("passes on this repo: every label the automation uses is in the file", () => {
    expect(checkLabels()).toEqual([]);
  });
});

describe("label file (#1116)", () => {
  const valid = {
    groups: {
      type: [{ color: "d73a4a", description: "Wrong behaviour", name: "bug" }],
    },
  };

  test("accepts a well-formed file", () => {
    expect(parseLabelFile(valid)).toEqual({
      labels: [
        { color: "d73a4a", description: "Wrong behaviour", name: "bug" },
      ],
      problems: [],
    });
  });

  test("rejects a missing description, a bad colour and a repeated name", () => {
    const { problems } = parseLabelFile({
      groups: {
        a: [{ color: "#d73a4a", description: "", name: "bug" }],
        b: [{ color: "d73a4a", description: "Again", name: "bug" }],
      },
    });

    expect(problems).toEqual([
      "bug: colour must be six hex digits without #, got #d73a4a",
      "bug: description is empty",
      "bug: listed more than once",
    ]);
  });

  test("rejects a file without groups", () => {
    expect(parseLabelFile({ labels: [] }).problems).toEqual([
      "the file must hold a `groups` object of label arrays",
    ]);
  });
});
