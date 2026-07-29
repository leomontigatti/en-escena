import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(currentDirectory, "../../../");
const scannedDirectories = ["app", "tests"];
const sourceFilePattern = /\.(ts|tsx)$/;

// La regla Unmarked = admin (.sandcastle/CODING_STANDARDS.md § Surface Prefix
// Rule) prohíbe marcar los símbolos de dominio de admin. Los loaders, handlers y
// hooks son los que ya volvieron marcados una vez: #508 fijó `loadAdmin*` como
// forma única y #527 tuvo que deshacerlo. Ese patrón se chequea sobre todas las
// apariciones, así que también atrapa un import que sobreviva a un rename.
const markedEntryPointPattern =
  /\b(?:load|handle|use)(?:Admin|Administrative)[A-Z][A-Za-z0-9_$]*/g;

// El resto se chequea sobre las declaraciones: tipos, componentes, helpers de
// filtro/formato y constantes. La marca tiene que estar al principio del
// identificador, o inmediatamente después de un verbo de lectura. Eso deja
// afuera por forma —sin allowlist— a los símbolos donde `Admin` nombra el rol y
// no la superficie: `requireAdminUser`, `createSignedInAdminRequest`,
// `getMissingItemAdminPath`. Por lo mismo la forma en minúscula solo cubre
// `administrative*`: un `admin*` suelto casi siempre es el usuario que actúa
// (`adminUser`, `adminRequest`), no la superficie.
const declarationPattern =
  /\b(?:type|interface|class|enum|function|const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
const markedDeclarationPatterns = [
  /^(?:Admin|Administrative)[A-Z]/,
  /^(?:read|build|get|to|list|find|set|is|has|resolve|default)(?:Admin|Administrative)[A-Z]/,
  /^administrative[A-Z]/,
];

// Las tres excepciones declaradas, todas estructurales:
// - `app/components/admin/`: el chrome nombra el shell, no un símbolo de dominio.
// - `AdminShell*`: el mismo chrome, declarado fuera de ese directorio.
// - `administrativeAudit*`: identificadores de base; renombrarlos cuesta una
//   migración.
// La capa de mutaciones (`createAdministrative*` / `updateAdministrative*`,
// #526) queda afuera por forma: `create` y `update` no están entre los verbos.
const chromeDirectory = path.join("app", "components", "admin");
const chromeSymbolPrefix = "AdminShell";
const databaseSymbolPrefix = "administrativeAudit";

describe("surface prefix rule", () => {
  test("declares no admin loader, handler or hook with a surface prefix", () => {
    const offenders = getSourceFiles().flatMap((filePath) => {
      const matches =
        readFileSync(filePath, "utf8").match(markedEntryPointPattern) ?? [];

      return matches.map((symbol) => formatOffender(filePath, symbol));
    });

    expect(unique(offenders)).toEqual([]);
  });

  test("declares no admin type, component, helper or constant with a surface prefix", () => {
    const offenders = getSourceFiles()
      .filter((filePath) => !isChromeFile(filePath))
      .flatMap((filePath) =>
        readDeclaredSymbols(filePath)
          .filter(isMarkedSymbol)
          .map((symbol) => formatOffender(filePath, symbol)),
      );

    expect(unique(offenders)).toEqual([]);
  });
});

function readDeclaredSymbols(filePath: string): string[] {
  return Array.from(
    readFileSync(filePath, "utf8").matchAll(declarationPattern),
    ([, symbol]) => symbol,
  );
}

function isMarkedSymbol(symbol: string) {
  if (
    symbol.startsWith(chromeSymbolPrefix) ||
    symbol.startsWith(databaseSymbolPrefix)
  ) {
    return false;
  }

  return markedDeclarationPatterns.some((pattern) => pattern.test(symbol));
}

function isChromeFile(filePath: string) {
  return path.relative(repositoryRoot, filePath).startsWith(chromeDirectory);
}

function formatOffender(filePath: string, symbol: string) {
  return `${path.relative(repositoryRoot, filePath)}: ${symbol}`;
}

function unique(offenders: string[]) {
  return Array.from(new Set(offenders)).sort();
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
