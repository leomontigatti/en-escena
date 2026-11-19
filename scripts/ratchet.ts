import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

import { z } from "zod";

// What a ratchet holds: a per-file count of something the tree should lose, in a
// committed list that only falls. Each check names its own list, how it counts
// and what a file should do instead; this module compares the counts with the
// list and the list with the base branch's.

/** Files allowed a count of the ratcheted thing, with how many. */
export type Counts = Record<string, number>;

const baseRef = "origin/master";

export type BaseList =
  | { state: "read"; list: Counts }
  // The base branch predates the ratchet: there is nothing to compare with yet.
  | { state: "absent" }
  | { state: "unreadable"; detail: string };

export type Ratchet = {
  /** The committed list, relative to the repository root. */
  listPath: string;
  /** Pluralised count of the thing, for messages: `3 type assertions`. */
  describe: (count: number) => string;
  /** What to do instead of adding one, with the doc that says so. */
  instead: string;
  /** The command that rewrites the list from the tree. */
  write: string;
};

const byName = (left: string, right: string) => left.localeCompare(right);

/** A file whose count differs from its entry, in either direction. */
export function countProblems(
  ratchet: Ratchet,
  counts: Counts,
  list: Counts,
): string[] {
  const files = new Set([...Object.keys(counts), ...Object.keys(list)]);

  return [...files].sort(byName).flatMap((file) => {
    const found = counts[file] ?? 0;
    const entry = list[file] ?? 0;

    if (found > entry) {
      return `${file}: ${ratchet.describe(found)}, ${ratchet.listPath} allows ${entry}. ${ratchet.instead}; the list never rises.`;
    }

    if (found < entry) {
      return `${file}: ${ratchet.describe(found)}, ${ratchet.listPath} says ${entry}. Lower its entry in this change: ${ratchet.write}.`;
    }

    return [];
  });
}

/** An entry the base branch's list does not hold, or holds lower. */
export function baseProblems(
  ratchet: Ratchet,
  list: Counts,
  base: BaseList,
): string[] {
  if (base.state === "absent") {
    return [];
  }

  if (base.state === "unreadable") {
    return [
      `Cannot read ${baseRef}'s ${ratchet.listPath} (${base.detail}), so no entry can be checked against it. Run \`git fetch origin master\` and check again.`,
    ];
  }

  return Object.entries(list)
    .sort(([left], [right]) => byName(left, right))
    .flatMap(([file, entry]) => {
      const baseEntry = base.list[file];

      if (baseEntry === undefined) {
        return `${file}: listed with ${entry}, but ${baseRef}'s list does not hold it. ${ratchet.instead}, instead of listing it.`;
      }

      if (entry > baseEntry) {
        return `${file}: listed with ${entry}, ${baseRef}'s list allows ${baseEntry}. An entry only falls. ${ratchet.instead}.`;
      }

      return [];
    });
}

const countsSchema = z.record(z.string(), z.number().int().positive());

export function parseCounts(text: string): Counts {
  return countsSchema.parse(JSON.parse(text));
}

function git(args: string[]) {
  return spawnSync("git", args, { encoding: "utf8" });
}

export function readBaseList(listPath: string): BaseList {
  if (
    git(["rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`]).status !==
    0
  ) {
    return { state: "unreadable", detail: `${baseRef} is missing` };
  }

  if (git(["cat-file", "-e", `${baseRef}:${listPath}`]).status !== 0) {
    return { state: "absent" };
  }

  try {
    return {
      state: "read",
      list: parseCounts(git(["show", `${baseRef}:${listPath}`]).stdout),
    };
  } catch (error) {
    return { state: "unreadable", detail: String(error) };
  }
}

/**
 * Every tracked source file but those `notCounted` names. Tracked, not what lint
 * walks: lint skips what its ignore patterns or `.gitignore` name, even a
 * committed file, and a ratchet counts what is committed.
 */
export function trackedSourceFiles(notCounted: readonly string[]): string[] {
  const extensions = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"];

  return execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--",
      ...extensions.map((extension) => `*.${extension}`),
      ...notCounted.map((pattern) => `:(exclude,glob)${pattern}`),
    ],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter((file) => file !== "" && existsSync(file));
}

/** Writes the list from the counts, sorted, and drops a file at zero. */
export function writeCounts(listPath: string, counts: Counts): void {
  const sorted = Object.fromEntries(
    Object.entries(counts)
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => byName(left, right)),
  );

  writeFileSync(listPath, `${JSON.stringify(sorted, null, 2)}\n`);
}
