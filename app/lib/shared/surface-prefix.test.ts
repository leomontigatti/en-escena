import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(currentDirectory, "../../../");
const scannedDirectories = ["app", "tests"];
const sourceFilePattern = /\.(ts|tsx)$/;

// La regla Unmarked = admin (.sandcastle/CODING_STANDARDS.md § Surface Prefix
// Rule) prohíbe marcar los símbolos de admin. Los loaders, handlers y hooks son
// los que ya volvieron marcados una vez: #508 fijó `loadAdmin*` como forma única
// y #527 tuvo que deshacerlo. Este guardrail cubre justo esa forma.
//
// Quedan fuera a propósito, y por eso el patrón no los alcanza:
// `createAdministrative*` / `updateAdministrative*` (capa de mutación, #526),
// los identificadores de base (`administrativeAuditEntries`) y el resto de
// símbolos `Admin*` que #527 no enumeró.
const markedEntryPointPattern =
  /\b(?:load|handle|use)(?:Admin|Administrative)[A-Z][A-Za-z0-9_$]*/g;

describe("surface prefix rule", () => {
  test("declares no admin loader, handler or hook with a surface prefix", () => {
    const offenders = getSourceFiles().flatMap((filePath) => {
      const matches =
        readFileSync(filePath, "utf8").match(markedEntryPointPattern) ?? [];

      return matches.map(
        (symbol) => `${path.relative(repositoryRoot, filePath)}: ${symbol}`,
      );
    });

    expect(Array.from(new Set(offenders)).sort()).toEqual([]);
  });
});

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
