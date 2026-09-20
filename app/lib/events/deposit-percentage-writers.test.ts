import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { collectSourceFiles } from "../../../scripts/source-files";

// `requiredDepositPercentage` is structural: `hasStructuralEventChanges` lists
// it, so `updateEvent` refuses to write it once the event has choreographies
// (#1042). That guard only covers the field while `updateEvent` is the only
// path that updates it — #1051 found a second one,
// `updateEventRequiredDepositPercentage`, which wrote the column with no guard
// at all and was reached by nothing but its own tests. Deleting it closed the
// hole; this guardrail is what keeps the next writer from reopening it
// silently, because a new `.set({ requiredDepositPercentage })` anywhere else
// fails here rather than shipping unnoticed. (`createEvent`'s insert is not a
// writer in this sense: a brand-new event has no choreographies to guard.)
const guardedWriterFile = "app/lib/events/management.server.ts";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../",
);
// Every directory that ships code able to reach the database, so a writer added
// outside `app/` is not invisible to the sweep.
const scannedDirectories = ["app", "scripts"];
const sourceFilePattern = /\.(ts|tsx)$/;
const testFilePattern = /\.(test|test-support|db)\.(ts|tsx)$/;

describe("deposit percentage writers", () => {
  test("only the guarded update writes the event deposit percentage", () => {
    const writers = findDepositPercentageWriters();

    expect(
      writers.map(({ filePath }) => filePath),
      describeWriters(writers),
    ).toEqual([guardedWriterFile]);
  });
});

type DepositPercentageWriter = {
  filePath: string;
  functionName: string;
};

/**
 * The enclosing function name is reported but deliberately not asserted:
 * renaming `updateEvent` changes no behaviour and must not fail this test. It
 * is here so a failure names the offending function instead of only its file.
 */
function describeWriters(writers: DepositPercentageWriter[]) {
  return `Writers found: ${writers
    .map(({ filePath, functionName }) => `${filePath} → ${functionName}`)
    .join(", ")}`;
}

function findDepositPercentageWriters(): DepositPercentageWriter[] {
  return scannedDirectories
    .flatMap((directory) =>
      collectSourceFiles({
        directoryPath: path.join(repositoryRoot, directory),
        keeps: (fileName) =>
          sourceFilePattern.test(fileName) && !testFilePattern.test(fileName),
      }),
    )
    .flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");

      return findUpdateArguments(source)
        .filter((update) => writesDepositPercentage(source, update.argument))
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
 * Hoisting the update values into a variable — `const values = {
 * requiredDepositPercentage }; …set(values)` — is the cheapest way to write the
 * column without the name appearing at the call site, so an argument that is a
 * bare identifier is resolved against its declaration in the same file before
 * being judged.
 */
function writesDepositPercentage(source: string, argument: string): boolean {
  if (argument.includes("requiredDepositPercentage")) {
    return true;
  }

  const identifier = argument.trim();

  if (!/^[A-Za-z0-9_$]+$/.test(identifier)) {
    return false;
  }

  const declaration = new RegExp(
    `(?:const|let|var)\\s+${identifier}\\s*(?::[^=]*)?=([^;]*)`,
  ).exec(source);

  return declaration?.[1]?.includes("requiredDepositPercentage") ?? false;
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

/**
 * Covers both shapes a writer can take — a `function` declaration and a
 * `const name = (…) =>` — so the failure message names something a reader can
 * search for rather than falling back to the file.
 */
function enclosingFunctionName(source: string, index: number) {
  const declarationPattern =
    /^(?:export )?(?:async )?(?:function ([A-Za-z0-9_$]+)|(?:const|let) ([A-Za-z0-9_$]+)\s*(?::[^=]*)?=\s*(?:async\s*)?[(<])/gm;
  let name = "<module>";
  let match: RegExpExecArray | null;

  while ((match = declarationPattern.exec(source)) !== null) {
    if (match.index > index) {
      break;
    }

    name = match[1] ?? match[2] ?? name;
  }

  return name;
}
