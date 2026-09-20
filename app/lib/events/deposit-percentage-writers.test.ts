import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { collectSourceFiles } from "../../../scripts/source-files";

// `requiredDepositPercentage` is structural: `hasStructuralEventChanges` lists
// it, so `updateEvent` refuses to write it once the event has choreographies
// (#1042). That guard only covers the field while `updateEvent` is the only
// writer of it — #1051 found a second one,
// `updateEventRequiredDepositPercentage`, which wrote the column with no guard
// at all and was reached by nothing but its own tests. Deleting it closed the
// hole; this guardrail is what keeps the next writer from reopening it
// silently, because a new `.set({ requiredDepositPercentage })` anywhere else
// fails here rather than shipping unnoticed.
const guardedWriter = {
  filePath: "app/lib/events/management.server.ts",
  functionName: "updateEvent",
};

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../",
);
const sourceFilePattern = /\.(ts|tsx)$/;
const testFilePattern = /\.(test|test-support|db)\.(ts|tsx)$/;

describe("deposit percentage writers", () => {
  test("only the guarded update writes the event deposit percentage", () => {
    expect(findDepositPercentageWriters()).toEqual([guardedWriter]);
  });
});

type DepositPercentageWriter = {
  filePath: string;
  functionName: string;
};

function findDepositPercentageWriters(): DepositPercentageWriter[] {
  return collectSourceFiles({
    directoryPath: path.join(repositoryRoot, "app"),
    keeps: (fileName) =>
      sourceFilePattern.test(fileName) && !testFilePattern.test(fileName),
  })
    .flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");

      return findUpdateArguments(source)
        .filter((update) =>
          update.argument.includes("requiredDepositPercentage"),
        )
        .map((update) => ({
          filePath: path
            .relative(repositoryRoot, filePath)
            .replaceAll(path.sep, "/"),
          functionName: enclosingFunctionName(source, update.index),
        }));
    })
    .sort((first, second) => first.filePath.localeCompare(second.filePath));
}

/**
 * The argument of every `update(events).set(...)`, with its offset in the
 * source. Narrowing to the `events` table keeps a `Map.set` — and an update of
 * any other table — out of the sweep.
 */
function findUpdateArguments(source: string) {
  const updates: { argument: string; index: number }[] = [];
  const eventUpdatePattern = /\.update\(\s*events\s*\)\s*\.set\(/g;
  let match: RegExpExecArray | null;

  while ((match = eventUpdatePattern.exec(source)) !== null) {
    const start = match.index + match[0].length;
    const end = findClosingParenthesis(source, start);

    updates.push({ argument: source.slice(start, end), index: match.index });
  }

  return updates;
}

function findClosingParenthesis(source: string, start: number) {
  let depth = 1;

  for (let cursor = start; cursor < source.length; cursor += 1) {
    if (source[cursor] === "(") {
      depth += 1;
    } else if (source[cursor] === ")") {
      depth -= 1;

      if (depth === 0) {
        return cursor;
      }
    }
  }

  return source.length;
}

function enclosingFunctionName(source: string, index: number) {
  const declarationPattern =
    /^(?:export )?(?:async )?function ([A-Za-z0-9_$]+)/gm;
  let name = "<module>";
  let match: RegExpExecArray | null;

  while ((match = declarationPattern.exec(source)) !== null) {
    if (match.index > index) {
      break;
    }

    name = match[1] ?? name;
  }

  return name;
}
