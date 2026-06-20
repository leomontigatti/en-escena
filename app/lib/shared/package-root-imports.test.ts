import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

const appRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../",
);

describe("package-root imports audit", () => {
  test("avoids package-root date-fns imports in app code", () => {
    const sourceFiles = getSourceFiles(appRoot);
    const packageRootImports = sourceFiles.filter((filePath) =>
      /from ["']date-fns["']/.test(readFileSync(filePath, "utf8")),
    );

    expect(packageRootImports).toEqual([]);
  });
});

function getSourceFiles(directoryPath: string): string[] {
  return readdirSync(directoryPath, { withFileTypes: true }).flatMap(
    (entry) => {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return getSourceFiles(entryPath);
      }

      if (
        !/\.(ts|tsx)$/.test(entry.name) ||
        /\.test\.(ts|tsx)$/.test(entry.name)
      ) {
        return [];
      }

      return [entryPath];
    },
  );
}
