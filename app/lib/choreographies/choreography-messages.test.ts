import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import {
  choreographyNotFoundMessage,
  formatChoreographyReferences,
  getClosedRegistrationPathMessage,
  getNoCompatibleCategoryRegistrationMessage,
} from "@/lib/choreographies/choreography-messages";

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

describe("no compatible category registration message", () => {
  test("names the modality the academy chose", () => {
    expect(
      getNoCompatibleCategoryRegistrationMessage({
        modalityName: "Jazz",
        groupType: "solo",
      }),
    ).toBe(
      "No hay una categoría de Jazz para Solo con las edades de estos bailarines. Revisá los bailarines o la modalidad.",
    );
  });

  // The name is read from a list the modality is guaranteed to be in, so this
  // is the fallback for a lookup that came back empty: the sentence has to
  // survive it rather than render "una categoría de  para …".
  test("drops the modality clause instead of leaving a hole in the sentence", () => {
    const message = getNoCompatibleCategoryRegistrationMessage({
      modalityName: null,
      groupType: "solo",
    });

    expect(message).toBe(
      "No hay una categoría para Solo con las edades de estos bailarines. Revisá los bailarines o la modalidad.",
    );
    expect(message).not.toContain("  ");
  });
});

describe("closed registration path message", () => {
  test("names the path whose every schedule is closed", () => {
    expect(
      getClosedRegistrationPathMessage({
        categoryName: "Infantil",
        modalityName: "Jazz",
        groupType: "solo",
      }),
    ).toBe("Las inscripciones para Infantil, Jazz, Solo están cerradas.");
  });

  // A registration can reach the schedules without a resolved category —
  // nothing to filter by— and the sentence names the rest of the path instead
  // of leaving a hole where the category would go.
  test("drops the clause of a name it does not have", () => {
    const message = getClosedRegistrationPathMessage({
      categoryName: null,
      modalityName: null,
      groupType: "grupal",
    });

    expect(message).toBe("Las inscripciones para Grupal están cerradas.");
  });
});

describe("choreography reference list", () => {
  test("sorts by number and joins the last one with `y`", () => {
    expect(
      formatChoreographyReferences([
        { choreographyNumber: 7, name: "Sombra" },
        { choreographyNumber: 3, name: "Luz" },
      ]),
    ).toBe("n.º 3 «Luz» y n.º 7 «Sombra»");
  });

  test("names a single choreography without a connector", () => {
    expect(
      formatChoreographyReferences([{ choreographyNumber: 3, name: "Luz" }]),
    ).toBe("n.º 3 «Luz»");
  });

  test("stops at five and counts what it left out", () => {
    const references = [1, 2, 3, 4, 5, 6, 7].map((choreographyNumber) => ({
      choreographyNumber,
      name: `Coreografía ${choreographyNumber}`,
    }));

    expect(formatChoreographyReferences(references)).toBe(
      "n.º 1 «Coreografía 1», n.º 2 «Coreografía 2», n.º 3 «Coreografía 3», n.º 4 «Coreografía 4», n.º 5 «Coreografía 5» y 2 más",
    );
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
