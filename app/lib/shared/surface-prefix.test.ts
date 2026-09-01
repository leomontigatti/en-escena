import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const guardrailFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(guardrailFile);
const repositoryRoot = path.resolve(currentDirectory, "../../../");
const scannedDirectories = ["app", "tests"];
const sourceFilePattern = /\.(ts|tsx)$/;

// The Unmarked = admin rule (.sandcastle/CODING_STANDARDS.md § Surface Prefix
// Rule) forbids marking admin's domain symbols. Loaders, handlers and hooks are
// the ones that already came back marked once: #508 fixed `loadAdmin*` as the
// single form and #527 had to undo it. That pattern is checked over every
// occurrence, so it also catches an import that survives a rename.
const markedEntryPointPattern =
  /\b(?:load|handle|use)(?:Admin|Administrative)[A-Z][A-Za-z0-9_$]*/g;

// The rest is checked over declarations: types, components, filter/format
// helpers and constants. The mark has to be at the start of the identifier, or
// immediately after a transformation verb. That leaves out by shape — with no
// allowlist — the symbols where `Admin` names the role and not the surface:
// `requireAdminUser`, `createSignedInAdminRequest`, `getMissingItemAdminPath`.
const declarationPattern =
  /\b(?:type|interface|class|enum|function|const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;

// The list of verbs is what holds up that "no allowlist", so a verb only gets
// in if the sweep raises no false positives and if its natural subject is the
// surface's data rather than the acting user. That is why these stay out, from
// the set evaluated in #544:
// - `render`: it picks up `renderAdminChildRoute` and `renderAdminRoute`, test
//   helpers that name the surface they mount. Covering it costs two exceptions.
// - `ensure` and `make`: synonyms of `require` and `create`, the verbs that name
//   the guard (`requireAdminUser`) and the role fixture
//   (`createSignedInAdminRequest`). Adding them breaks exactly that exclusion.
// - `should`, `can`, `with`, `from`: predicates and prepositions whose usual
//   subject is the acting user (`canAdminUserEdit`, `withAdminUser`).
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

// The lowercase form only covers `administrative*`: a bare `admin*` is almost
// always the acting user (`adminUser`, `adminRequest`), 25 cases in the sweep.
// Restricting it to module-level `const` (column 0) brings those 25 down to 3,
// but not to 0, so the hole stays open on purpose: closing it asks for an
// allowlist and a rename, and this file prefers narrower coverage with no
// exceptions. The 3 are noted here to be decided separately:
// - `app/routes/administracion._index.tsx: adminHomeCards` — genuinely marked.
// - `app/features/admin/migration.audit.test.ts: adminComponentsDirectory` and
//   `app/lib/shared/domain-docs.test.ts: adminMigrationMapRequirements` —
//   metadata naming the chrome directory and the migration doc, the same
//   structural case as the `app/components/admin/` exception but declared
//   outside it.
const markedDeclarationPatterns = [
  /^(?:Admin|Administrative)[A-Z]/,
  new RegExp(
    `^(?:${markedSymbolVerbs.join("|")})(?:Admin|Administrative)[A-Z]`,
  ),
  /^administrative[A-Z]/,
];

// The two declared exceptions, both structural:
// - `app/components/admin/`: the chrome names the shell, not a domain symbol.
// - `AdminShell*`: the same chrome, declared outside that directory.
// The mutation layer (`createAdministrative*` / `updateAdministrative*`, #526)
// stays out by shape: `create` and `update` are not among the verbs.
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

// A guardrail that catches by shape is only worth what it catches: the two tests
// above pass just the same if a pattern stops matching. These inject one symbol
// per pattern to prove each one bites, and the counterexamples pin down the
// exclusions the "no allowlist" depends on.
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

  // The list of verbs is assembled with a `join("|")`, so every verb depends on
  // the alternation reaching it: a misspelled one, or one shadowed by a shorter
  // one, would stop catching without any example above noticing.
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

  // The two structural exceptions, one per mechanism: the chrome prefix exempts
  // the symbol, the chrome directory exempts the file.
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

// The exception is the directory, not the prefix of its name: without the
// separator, a future `app/components/administracion/` would be exempt without
// having asked for it.
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

// The guardrail itself stays out of the sweep: the symbols it injects to prove
// each pattern are literals of this file and would report themselves. It
// declares no domain symbols, so the exclusion hides nothing.
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
