import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(currentDirectory, "../../");
const dateFnsPackageRootImportPattern = /from ["']date-fns["']/;
const sourceFilePattern = /\.(ts|tsx)$/;
const testFilePattern = /\.test\.(ts|tsx)$/;

describe("package-root imports audit", () => {
  test("avoids package-root date-fns imports in app code", () => {
    const sourceFiles = getAppSourceFiles(appDirectory);
    const packageRootImports = sourceFiles.filter((filePath) =>
      dateFnsPackageRootImportPattern.test(readFileSync(filePath, "utf8")),
    );

    expect(
      packageRootImports.map((filePath) =>
        path.relative(appDirectory, filePath),
      ),
    ).toEqual([]);
  });
});

function getAppSourceFiles(directoryPath: string): string[] {
  return readdirSync(directoryPath, { withFileTypes: true }).flatMap(
    (entry) => {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return getAppSourceFiles(entryPath);
      }

      if (
        !sourceFilePattern.test(entry.name) ||
        testFilePattern.test(entry.name)
      ) {
        return [];
      }

      return [entryPath];
    },
  );
}
