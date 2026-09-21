import { readFileSync } from "node:fs";
import path from "node:path";

// The repo's labels as code (#1116).
//
// `.github/labels.json` is the one list of the labels this repo uses. The
// sync script pushes it to GitHub and the check holds the automation to it, so
// the file, the repo and the workflows cannot drift apart silently. The
// meaning of each label stays in docs/agents/triage-labels.md and
// docs/agents/afk-setup.md; the file only says which labels exist.

export const labelFilePath = ".github/labels.json";

export type Label = {
  color: string;
  description: string;
  name: string;
};

const colourPattern = /^[0-9a-f]{6}$/i;

/**
 * Validate the file's shape. Groups only organise the file; the result is flat.
 */
export function parseLabelFile(json: unknown): {
  labels: Label[];
  problems: string[];
} {
  const groups = (json as { groups?: unknown } | null)?.groups;

  if (
    typeof groups !== "object" ||
    groups === null ||
    !Object.values(groups).every(Array.isArray)
  ) {
    return {
      labels: [],
      problems: ["the file must hold a `groups` object of label arrays"],
    };
  }

  const labels = Object.values(groups as Record<string, Label[]>).flat();
  const seen = new Set<string>();
  const problems = labels.flatMap((label) => {
    const found: string[] = [];

    if (!colourPattern.test(label.color ?? "")) {
      found.push(
        `${label.name}: colour must be six hex digits without #, got ${label.color}`,
      );
    }
    if (!label.description?.trim()) {
      found.push(`${label.name}: description is empty`);
    }
    if (seen.has(label.name)) {
      found.push(`${label.name}: listed more than once`);
    }
    seen.add(label.name);

    return found;
  });

  return { labels, problems };
}

export function readLabelFile(rootDirectory = process.cwd()): Label[] {
  const { labels, problems } = parseLabelFile(
    JSON.parse(
      readFileSync(path.join(rootDirectory, labelFilePath), "utf8"),
    ) as unknown,
  );

  if (problems.length > 0) {
    throw new Error(
      [`${labelFilePath} is invalid:`, ...problems.map((p) => `- ${p}`)].join(
        "\n",
      ),
    );
  }

  return labels;
}
