import { execFileSync } from "node:child_process";

import { describe, expect, test } from "vitest";

import {
  checkCommentLanguage,
  findSpanishProseInSource,
  readGlossaryNouns,
  scannedDirectories,
} from "./check-comment-language";

const filePath = "app/features/admin/example.tsx";
const glossaryNouns = readGlossaryNouns(process.cwd());

function violationsIn(contents: string) {
  return findSpanishProseInSource({ contents, filePath, glossaryNouns });
}

function kindsIn(contents: string): string[] {
  return violationsIn(contents).map((violation) => violation.kind);
}

describe("comment-language guardrail (#592)", () => {
  test("fires on a Spanish line comment and on a Spanish block comment", () => {
    expect(kindsIn(`// La alerta no se suprime para el auditor.`)).toEqual([
      "comment",
    ]);
    expect(
      kindsIn(`/* Esto queda sin nivel porque la fila es vieja. */`),
    ).toEqual(["comment"]);
    expect(
      kindsIn(`const value = 1; // Se calcula una vez por evento.`),
    ).toEqual(["comment"]);
  });

  test("reports the line, the markers and the passage", () => {
    const [violation] = violationsIn(
      `const value = 1;\n\n// El motivo del bloqueo no se guarda.\n`,
    );

    expect(violation.lineNumber).toBe(3);
    expect(violation.filePath).toBe(filePath);
    expect(violation.markers).toContain("del");
    expect(violation.text).toContain("El motivo");
  });

  test("stays quiet on English prose", () => {
    expect(
      kindsIn(
        `// The alert is not suppressed for the auditor.\n// TODO: revisit`,
      ),
    ).toEqual([]);
  });

  // #769 reported that the sweep's first pass missed short one-line comments,
  // `// ARCA respondió y no autorizó.` among them. A word list that skipped
  // every short word inherited exactly that hole.
  test("catches short Spanish built only from short words", () => {
    expect(kindsIn(`// Se ejecuta al montar el componente.`)).toEqual([
      "comment",
    ]);
    expect(kindsIn(`// Devuelve el total con IVA incluido.`)).toEqual([
      "comment",
    ]);
    expect(kindsIn(`test("cierra la sesión activa", () => {});`)).toEqual([
      "test name",
    ]);
  });

  // #769's founding example, and the whole reason the second instrument exists:
  // a sentence built from a proper noun and two conjugated verbs carries no
  // function word at all, so no list of them can ever reach it (#792).
  test("catches Spanish carried only by accented verbs", () => {
    expect(kindsIn(`// ARCA respondió y no autorizó.`)).toEqual(["comment"]);
  });

  // The other half of that disjointness: `Nota de crédito` has no `CONTEXT.md`
  // entry, so the vocabulary rule cannot name it and only morphology reaches it.
  test("catches an accented term the glossary never lists", () => {
    expect(
      kindsIn(`// The mirror Nota de crédito annuls the original.`),
    ).toEqual(["comment"]);
  });

  // A place name keeps its accent inside an English sentence, the same way
  // "São Paulo" would. Matching one says nothing about the language around it.
  test("does not read an accented proper noun as Spanish prose", () => {
    expect(kindsIn(`// Defaults to Córdoba's business date.`)).toEqual([]);
  });

  // The short list is the only one that collides with acronyms, because it is
  // the only one whose entries are two letters long.
  test("does not read an acronym as a short Spanish word", () => {
    expect(kindsIn(`// Reported to the UN and to the ES locale team.`)).toEqual(
      [],
    );
    expect(kindsIn(`// SE quadrant only.`)).toEqual([]);
  });

  // The inflection the glossary does not list is the same violation as the
  // headword it comes from: `profesor` has a row in CONTEXT.md, `profesores`
  // does not, and nobody writing the second means anything different.
  test("catches a glossary noun in an inflection the glossary never lists", () => {
    expect(
      kindsIn(`// Shows the empty state when there are no profesores.`),
    ).toEqual(["comment"]);
    expect(
      kindsIn(`test("creates modalidades and submodalidades", () => {});`),
    ).toEqual(["test name"]);
  });

  // That tail is a closed set of Spanish endings and not `\p{L}*`, because an
  // open one reads the English `activate` as an inflection of `activa`. All
  // three of `activate`, `activates` and `activation` are live in the tree.
  test("does not read an English word as an inflection of a glossary noun", () => {
    expect(
      kindsIn(`// The loader activates the one it was given, on activation.`),
    ).toEqual([]);
  });

  // #792 settled this the strict way: prose is governed exactly like an
  // identifier, so a glossary noun is a violation in a comment for the same
  // reason it would be in a name.
  test("catches the Spanish domain nouns the glossary names", () => {
    expect(
      kindsIn(
        `// The modalidad does not close the field: it only rejects a correction\n// that would move the cronograma of the coreografía.`,
      ),
    ).toEqual(["comment"]);
  });

  // The one term CODING_STANDARDS reserves, and the reason the list is not
  // empty: an empty reserved list has no escape valve and breaks quietly.
  test("leaves the reserved term alone, inflection included", () => {
    expect(
      kindsIn(`// The comprobante is derived; comprobantes are immutable.`),
    ).toEqual([]);
  });

  // Naming the Spanish term is still allowed. It just has to be marked as the
  // data it is, which is what the identifier rule has always asked for.
  test("allows a glossary term marked as the data it is", () => {
    expect(
      kindsIn(`// Shared across the \`Bases del evento\` routes.`),
    ).toEqual([]);
    expect(
      kindsIn(`// The button reads "Pagar la seña que falta" once it is due.`),
    ).toEqual([]);
  });

  // Glossary words that are ordinary English: "Total de inscripción" is what
  // puts `total` in the list, and `// the total is frozen` is not Spanish.
  test("does not read an English homograph of a glossary word as Spanish", () => {
    expect(
      kindsIn(`// The total is frozen once emitted; the base price is not.`),
    ).toEqual([]);
  });

  // Without the glossary the vocabulary rule has nothing to match on, which is
  // what keeps it honest: CONTEXT.md names the term, the checker does not guess.
  test("the glossary is what makes a domain noun a violation", () => {
    expect(
      findSpanishProseInSource({
        contents: `// The cronograma is fixed at registration.`,
        filePath,
      }),
    ).toEqual([]);
    expect(kindsIn(`// The cronograma is fixed at registration.`)).toEqual([
      "comment",
    ]);
  });

  test("treats quoted copy, backticks, routes and URLs as the data they are", () => {
    expect(
      kindsIn(`// The button reads "Pagar la seña que falta" once it is due.`),
    ).toEqual([]);
    expect(kindsIn(`// Mirrors \`estado=todos&participando=no\`.`)).toEqual([]);
    expect(
      kindsIn(`// Redirects to /administracion/bases-del-evento/precios.`),
    ).toEqual([]);
  });

  // A line match read the `//` of a URL as the start of a comment, and split a
  // backticked term across a comment run into halves that stopped looking like
  // data. Both were live false positives before the scanner replaced it.
  test("does not read a comment out of a string literal", () => {
    expect(
      kindsIn(
        `const requestUrl = \`http://localhost/administracion/bailarines?estado=todos\`;`,
      ),
    ).toEqual([]);
  });

  test("reads a run of line comments as one passage, so data can wrap", () => {
    expect(
      kindsIn(
        `// The label is the whole sentence, as \`Descuento\n// por bailarín\` shows.`,
      ),
    ).toEqual([]);
  });

  test("fires on a Spanish test name, in every form the suite uses", () => {
    expect(
      kindsIn(`test("no emite cuando falta el número", () => {});`),
    ).toEqual(["test name"]);
    expect(
      kindsIn(`describe("rutas de Bases, para el auditor", () => {});`),
    ).toEqual(["test name"]);
    expect(
      kindsIn(
        `test.each(["a", "b"])("\`%s\` es un error genérico, no una contingencia", () => {});`,
      ),
    ).toEqual(["test name"]);
  });

  test("leaves an English test name alone", () => {
    expect(
      kindsIn(
        `test("refuses to move the price that covers its deposit", () => {});`,
      ),
    ).toEqual([]);
    expect(
      kindsIn(`test("collects \`Bases del evento\` breadcrumbs", () => {});`),
    ).toEqual([]);
  });

  // Fixtures are why the callee is resolved instead of pattern-matched: this
  // very file carries Spanish test names inside strings, and a regex over the
  // file would report them as real ones.
  test("ignores a test call that is only a fixture inside a string", () => {
    expect(
      kindsIn(
        `const fixture = \`test("no emite cuando falta el número", () => {});\`;`,
      ),
    ).toEqual([]);
    expect(kindsIn(`translate("no emite cuando falta el número");`)).toEqual(
      [],
    );
  });

  // The assertion that actually guards the repo.
  test("the repository carries no Spanish comment and no Spanish test name", async () => {
    await expect(checkCommentLanguage()).resolves.toEqual([]);
  });

  // Twice now the gate has passed only because it was not looking: first at the
  // repo-root configs, where `vitest.config.ts` sat, then at `.sandcastle/`.
  // Both times the list of roots was the bug, so the list is what gets pinned —
  // a clean run says nothing if the directory was never walked.
  // Tracked files, not a directory listing: `.react-router` and `build/` hold
  // generated `.ts` nobody writes prose into, and asking git is what separates
  // "source we own" from "output we emit" without a second list to keep in sync.
  test("every directory holding tracked scannable source is a scan root", () => {
    const trackedSource = execFileSync(
      "git",
      ["ls-files", "*.ts", "*.tsx", "*.mts", "*.mjs"],
      { cwd: process.cwd(), encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);

    const unscanned = [
      ...new Set(
        trackedSource
          .filter((repoRelativePath) => repoRelativePath.includes("/"))
          .map((repoRelativePath) => repoRelativePath.split("/")[0])
          .filter((directory) => !scannedDirectories.includes(directory)),
      ),
    ];

    expect(unscanned).toEqual([]);
  });
});
