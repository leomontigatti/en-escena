import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { labelFilePath, readLabelFile } from "./labels";
import { collectSourceFiles } from "./source-files";

// Every label the automation names is in `.github/labels.json` (#1116).
//
// The AFK state machine runs on exact label strings. A typo in a workflow's
// `--add-label` does not fail anything until the run that needs it: GitHub
// refuses the edit mid-run, or a trigger waits forever on a label nobody can
// add. This check moves that failure to CI, and it is the part of labels-as-code
// that pays for the rest.
//
// It reads the forms the repo actually uses rather than grepping for every
// name, because `bug` and `chore` are English words all over the prose. A bare
// label string in TypeScript that no form below matches is not seen; keep label
// names in a prefixed family or behind a `--label` flag and it will be.

const scanned: { directory: string; keeps: RegExp }[] = [
  { directory: ".github/workflows", keeps: /\.ya?ml$/ },
  { directory: ".sandcastle", keeps: /\.(ts|mts|md)$/ },
  { directory: "scripts", keeps: /\.(ts|mts|mjs|sh)$/ },
  { directory: ".claude/skills", keeps: /\.md$/ },
  { directory: ".claude/agents", keeps: /\.md$/ },
];

// Fixtures in tests hold misspelled labels on purpose.
const testFilePattern = /\.test\.(ts|mts)$/;

// A label value ends on a letter or digit and is not followed by anything that
// makes it a placeholder (`wayfinder:<type>`), a family (`agent:*`) or longer.
const labelValue = String.raw`[A-Za-z0-9](?:[\w:,-]*[A-Za-z0-9])?(?![\w:<*,-])`;

const referencePatterns: RegExp[] = [
  // `--label needs-triage`, `--add-label "agent:blocked"`, `--label=bug,chore`,
  // and the argv form the Sandcastle runners pass to `gh`, where the flag and
  // its value are separate strings, often on separate lines.
  new RegExp(
    String.raw`--(?:add-|remove-)?label["']?(?:\s*,\s*|=|\s+)["']?(${labelValue})`,
    "dg",
  ),
  // Workflow trigger conditions.
  new RegExp(String.raw`label\.name\s*===?\s*["'](${labelValue})["']`, "dg"),
  // jq equality, as in the list of labels a sub-issue inherits.
  new RegExp(String.raw`(?:^|[\s(])\.\s*==\s*"(${labelValue})"`, "dg"),
  // A prefixed family name is never prose, so it counts wherever it appears —
  // except as a pnpm script, which shares the `agent:` prefix.
  new RegExp(
    String.raw`(?<!pnpm (?:run )?)\b((?:agent|source|priority|wayfinder):${labelValue})`,
    "dg",
  ),
];

export type LabelReference = {
  filePath: string;
  label: string;
  lineNumber: number;
};

export function findLabelReferencesInSource(input: {
  contents: string;
  filePath: string;
}): LabelReference[] {
  const byOffset = new Map<number, string>();

  for (const pattern of referencePatterns) {
    for (const match of input.contents.matchAll(pattern)) {
      let offset = match.indices?.[1]?.[0] ?? 0;

      for (const label of match[1].split(",")) {
        if (label) {
          byOffset.set(offset, label);
        }
        offset += label.length + 1;
      }
    }
  }

  return [...byOffset]
    .sort(([a], [b]) => a - b)
    .map(([offset, label]) => ({
      filePath: input.filePath,
      label,
      lineNumber: input.contents.slice(0, offset).split("\n").length,
    }));
}

type CheckLabelsOptions = {
  files?: { contents: string; filePath: string }[];
  known?: string[];
  rootDirectory?: string;
};

export function checkLabels(
  options: CheckLabelsOptions = {},
): LabelReference[] {
  const rootDirectory = options.rootDirectory ?? process.cwd();
  const known = new Set(
    options.known ?? readLabelFile(rootDirectory).map((label) => label.name),
  );
  const files =
    options.files ??
    scanned
      .flatMap(({ directory, keeps }) =>
        collectSourceFiles({
          directoryPath: path.join(rootDirectory, directory),
          keeps: (fileName) =>
            keeps.test(fileName) && !testFilePattern.test(fileName),
        }),
      )
      .map((absolutePath) => ({
        contents: readFileSync(absolutePath, "utf8"),
        filePath: path.relative(rootDirectory, absolutePath),
      }));

  return files
    .flatMap(findLabelReferencesInSource)
    .filter((reference) => !known.has(reference.label));
}

function runLabelsCheck(): void {
  const violations = checkLabels();

  if (violations.length === 0) {
    return;
  }

  throw new Error(
    [
      `Labels referenced but not in ${labelFilePath}:`,
      ...violations.map(
        (violation) =>
          `- ${violation.filePath}:${violation.lineNumber} ${violation.label}`,
      ),
      "",
      `Fix the spelling, or add the label to ${labelFilePath} and run \`pnpm labels:sync\`.`,
    ].join("\n"),
  );
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  try {
    runLabelsCheck();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}
