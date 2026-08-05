import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const guardrailFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(guardrailFile);
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
// identificador, o inmediatamente después de un verbo de transformación. Eso
// deja afuera por forma —sin allowlist— a los símbolos donde `Admin` nombra el
// rol y no la superficie: `requireAdminUser`, `createSignedInAdminRequest`,
// `getMissingItemAdminPath`.
const declarationPattern =
  /\b(?:type|interface|class|enum|function|const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;

// La enumeración de verbos es lo que sostiene ese "sin allowlist", así que un
// verbo entra sólo si el barrido no levanta falsos positivos y si su sujeto
// natural es el dato de la superficie y no el usuario que actúa. Por eso quedan
// afuera, del set evaluado en #544:
// - `render`: levanta `renderAdminChildRoute` y `renderAdminRoute`, helpers de
//   test que nombran la superficie que montan. Cubrirlo cuesta dos excepciones.
// - `ensure` y `make`: sinónimos de `require` y `create`, los verbos con los que
//   se nombran el guard (`requireAdminUser`) y el fixture del rol
//   (`createSignedInAdminRequest`). Sumarlos rompe justo esa exclusión.
// - `should`, `can`, `with`, `from`: predicados y preposiciones cuyo sujeto
//   habitual es el usuario que actúa (`canAdminUserEdit`, `withAdminUser`).
const markedSymbolVerbs = [
  "read",
  "build",
  "get",
  "to",
  "list",
  "find",
  "set",
  "is",
  "has",
  "resolve",
  "default",
  "format",
  "map",
  "parse",
  "serialize",
  "normalize",
  "select",
  "count",
  "sort",
  "filter",
];

// La forma en minúscula sólo cubre `administrative*`: un `admin*` suelto casi
// siempre es el usuario que actúa (`adminUser`, `adminRequest`), 25 casos en el
// barrido. Restringirlo a `const` de módulo (columna 0) baja esos 25 a 3, pero
// no a 0, así que el agujero sigue abierto a propósito: cerrarlo pide una
// allowlist y un rename, y este archivo prefiere cobertura menor sin
// excepciones. Los 3 quedan anotados para decidirlos aparte:
// - `app/routes/administracion._index.tsx: adminHomeCards` — marcado de verdad.
// - `app/features/admin/migration.audit.test.ts: adminComponentsDirectory` y
//   `app/lib/shared/domain-docs.test.ts: adminMigrationMapRequirements` —
//   metadata que nombra el directorio de chrome y el doc de migración, el mismo
//   caso estructural que la excepción `app/components/admin/` pero declarado
//   fuera de ella.
const markedDeclarationPatterns = [
  /^(?:Admin|Administrative)[A-Z]/,
  new RegExp(
    `^(?:${markedSymbolVerbs.join("|")})(?:Admin|Administrative)[A-Z]`,
  ),
  /^administrative[A-Z]/,
];

// Las dos excepciones declaradas, ambas estructurales:
// - `app/components/admin/`: el chrome nombra el shell, no un símbolo de dominio.
// - `AdminShell*`: el mismo chrome, declarado fuera de ese directorio.
// La capa de mutaciones (`createAdministrative*` / `updateAdministrative*`,
// #526) queda afuera por forma: `create` y `update` no están entre los verbos.
const chromeDirectory = path.join("app", "components", "admin");
const chromeSymbolPrefix = "AdminShell";

describe("surface prefix rule", () => {
  test("declares no admin loader, handler or hook with a surface prefix", () => {
    const offenders = getSourceFiles().flatMap((filePath) =>
      readMarkedEntryPoints(readFileSync(filePath, "utf8")).map((symbol) =>
        formatOffender(filePath, symbol),
      ),
    );

    expect(unique(offenders)).toEqual([]);
  });

  test("declares no admin type, component, helper or constant with a surface prefix", () => {
    const offenders = getSourceFiles()
      .filter((filePath) => !isChromeFile(filePath))
      .flatMap((filePath) =>
        readMarkedDeclarations(readFileSync(filePath, "utf8")).map((symbol) =>
          formatOffender(filePath, symbol),
        ),
      );

    expect(unique(offenders)).toEqual([]);
  });
});

// Un guardrail que atrapa por forma sólo vale lo que atrapa: los dos tests de
// arriba pasan igual si un patrón deja de matchear. Estos inyectan un símbolo
// por patrón para probar que cada uno agarra, y los contraejemplos fijan las
// exclusiones de las que depende el "sin allowlist".
describe("surface prefix guardrail", () => {
  test.each([
    ["export async function loadAdminPayments() {}", "loadAdminPayments"],
    [
      "export function handleAdministrativeDetailAction() {}",
      "handleAdministrativeDetailAction",
    ],
    ["export function useAdminRosterForm() {}", "useAdminRosterForm"],
  ])("catches the injected entry point %s", (source, symbol) => {
    expect(readMarkedEntryPoints(source)).toEqual([symbol]);
  });

  test.each([
    ["export type AdminPaymentsLoaderData = never;", "AdminPaymentsLoaderData"],
    [
      "export function readAdminPaymentsListFilters() {}",
      "readAdminPaymentsListFilters",
    ],
    ["export function formatAdminPaymentRow() {}", "formatAdminPaymentRow"],
    ["export function mapAdminDancerRow() {}", "mapAdminDancerRow"],
    ["export function parseAdminFilters() {}", "parseAdminFilters"],
    [
      "export function serializeAdministrativeEventContext() {}",
      "serializeAdministrativeEventContext",
    ],
    [
      "export const administrativePaymentIntent = 1;",
      "administrativePaymentIntent",
    ],
  ])("catches the injected declaration %s", (source, symbol) => {
    expect(readMarkedDeclarations(source)).toEqual([symbol]);
  });

  // La lista de verbos se arma con un `join("|")`, así que cada verbo depende de
  // que la alternancia lo alcance: uno mal escrito, o tapado por otro más corto,
  // dejaría de atrapar sin que ningún ejemplo de arriba lo note.
  test.each(markedSymbolVerbs)("catches the %s verb", (verb) => {
    expect(
      readMarkedDeclarations(`export function ${verb}AdminPaymentRow() {}`),
    ).toEqual([`${verb}AdminPaymentRow`]);
  });

  test.each([
    "export function requireAdminUser() {}",
    "export function createSignedInAdminRequest() {}",
    "export function getMissingItemAdminPath() {}",
    "export function createAdministrativeEvent() {}",
    "const adminUser = 1;",
  ])("leaves the role-named symbol %s alone", (source) => {
    expect(readMarkedDeclarations(source)).toEqual([]);
  });

  // Las dos excepciones estructurales, una por mecanismo: el prefijo del chrome
  // exime al símbolo, el directorio del chrome exime al archivo.
  test("leaves the chrome shell symbol alone", () => {
    expect(
      readMarkedDeclarations("export function AdminShellSidebar() {}"),
    ).toEqual([]);
  });

  test.each([
    [path.join("app", "components", "admin", "shell.tsx"), true],
    [path.join("app", "components", "administracion", "shell.tsx"), false],
    [path.join("app", "routes", "administracion._index.tsx"), false],
  ])("reads %s as a chrome file: %s", (relativePath, expected) => {
    expect(isChromeFile(path.join(repositoryRoot, relativePath))).toBe(
      expected,
    );
  });

  test("names the file and the symbol of an offender", () => {
    const filePath = path.join(repositoryRoot, "app", "routes", "example.tsx");

    expect(formatOffender(filePath, "AdminPaymentsLoaderData")).toBe(
      "app/routes/example.tsx: AdminPaymentsLoaderData",
    );
  });
});

function readMarkedEntryPoints(source: string): string[] {
  return source.match(markedEntryPointPattern) ?? [];
}

function readMarkedDeclarations(source: string): string[] {
  return Array.from(
    source.matchAll(declarationPattern),
    ([, symbol]) => symbol,
  ).filter(isMarkedSymbol);
}

function isMarkedSymbol(symbol: string) {
  if (symbol.startsWith(chromeSymbolPrefix)) {
    return false;
  }

  return markedDeclarationPatterns.some((pattern) => pattern.test(symbol));
}

// La excepción es el directorio, no el prefijo de su nombre: sin el separador,
// un `app/components/administracion/` futuro quedaría exento sin haberlo pedido.
function isChromeFile(filePath: string) {
  return path
    .relative(repositoryRoot, filePath)
    .startsWith(chromeDirectory + path.sep);
}

function formatOffender(filePath: string, symbol: string) {
  return `${path.relative(repositoryRoot, filePath)}: ${symbol}`;
}

function unique(offenders: string[]) {
  return Array.from(new Set(offenders)).sort();
}

// El propio guardrail queda fuera del barrido: los símbolos que inyecta para
// probar cada patrón son literales de este archivo y se reportarían a sí mismos.
// No declara símbolos de dominio, así que la exclusión no tapa nada.
function getSourceFiles(): string[] {
  return scannedDirectories
    .flatMap((directory) =>
      collectSourceFiles(path.join(repositoryRoot, directory)),
    )
    .filter((filePath) => filePath !== guardrailFile);
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
