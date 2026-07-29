import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";

const currentFilePath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(currentFilePath), "../../../");
const scannedDirectories = ["app", "tests"];
const sourceFilePattern = /\.(ts|tsx)$/;

// #537: the copy was declared four times and written inline four more. All
// eight matched character by character and nothing guaranteed it — fixing the
// wording on one surface left the other seven showing the old text without any
// test failing. This check is that guarantee: the literal lives in
// `choreography-messages.ts` and everything else imports it.
const canonicalModule = path.join(
  "app",
  "lib",
  "choreographies",
  "choreography-messages.ts",
);

describe("choreography messages", () => {
  test("writes the not-found copy in a single module", () => {
    const offenders = getSourceFiles()
      .filter((filePath) => filePath !== currentFilePath)
      .map((filePath) => path.relative(repositoryRoot, filePath))
      .filter((relativePath) => relativePath !== canonicalModule)
      .filter((relativePath) =>
        containsNotFoundCopy(
          readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
        ),
      );

    expect(offenders.sort()).toEqual([]);
  });

  test("catches a duplicate written with any string delimiter", () => {
    const duplicates = [
      `const doubleQuoted = "${choreographyNotFoundMessage}";`,
      `const singleQuoted = '${choreographyNotFoundMessage}';`,
      `const templateLiteral = \`${choreographyNotFoundMessage}\`;`,
    ];

    expect(duplicates.filter(containsNotFoundCopy)).toEqual(duplicates);
  });

  test("leaves a longer message that opens with the same words alone", () => {
    const financeListCopy =
      "No encontramos esa coreografía dentro de la lista financiera de la academia.";

    expect(containsNotFoundCopy(financeListCopy)).toBe(false);
  });
});

// Matching the sentence without its delimiters is what actually holds the
// guarantee. Prettier normalizes quoted strings to double quotes, but it leaves
// template literals as written, so a `` `…` `` duplicate would pass a
// `"…"`-only search and reintroduce the exact drift this module prevents.
function containsNotFoundCopy(content: string) {
  return content.includes(choreographyNotFoundMessage);
}

function getSourceFiles(): string[] {
  return scannedDirectories.flatMap((directory) =>
    collectSourceFiles(path.join(repositoryRoot, directory)),
  );
}

function collectSourceFiles(directoryPath: string): string[] {
  return readdirSync(directoryPath, { withFileTypes: true }).flatMap(
    (entry) => {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return collectSourceFiles(entryPath);
      }

      return sourceFilePattern.test(entry.name) ? [entryPath] : [];
    },
  );
}
