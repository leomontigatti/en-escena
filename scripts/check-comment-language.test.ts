import { describe, expect, test } from "vitest";

import {
  checkCommentLanguage,
  findSpanishProseInSource,
  readGlossaryTerms,
} from "./check-comment-language";

const filePath = "app/features/admin/example.tsx";
const glossaryTerms = readGlossaryTerms(process.cwd());

function violationsIn(contents: string) {
  return findSpanishProseInSource({ contents, filePath, glossaryTerms });
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

  // Pinned as the known floor, not as desired behaviour: #769 named this exact
  // comment as one its first pass missed, and it is still missed. Closing it
  // needs the accent rule that #792 owns — see the note in the script.
  test("still misses Spanish carried only by accented verbs", () => {
    expect(kindsIn(`// ARCA respondió y no autorizó.`)).toEqual([]);
  });

  // The short list is the only one that collides with acronyms, because it is
  // the only one whose entries are two letters long.
  test("does not read an acronym as a short Spanish word", () => {
    expect(kindsIn(`// Reported to the UN and to the ES locale team.`)).toEqual(
      [],
    );
    expect(kindsIn(`// SE quadrant only.`)).toEqual([]);
  });

  // Blanking "Profesor" out of "profesores" used to leave a bare "es" behind,
  // which then read as the Spanish word it is not.
  test("blanks a glossary term together with its inflection", () => {
    expect(
      kindsIn(`// Shows the empty state when there are no profesores.`),
    ).toEqual([]);
    expect(
      kindsIn(`test("creates modalidades and submodalidades", () => {});`),
    ).toEqual([]);
  });

  // The rule is about the language of the sentence, not about which nouns it
  // uses: CONTEXT.md exists so English prose can name the Spanish term.
  test("allows the Spanish domain nouns the glossary reserves", () => {
    expect(
      kindsIn(
        `// A seña does not close the modalidad: it only rejects a correction\n// that would move the cronograma of the coreografía.`,
      ),
    ).toEqual([]);
  });

  test("allows a glossary term that carries a Spanish function word", () => {
    expect(kindsIn(`// Shared across the Bases del evento routes.`)).toEqual(
      [],
    );
    expect(
      kindsIn(`// The Descuento por bailarín is applied once per inscription.`),
    ).toEqual([]);
  });

  // Without the glossary those same passages are Spanish-looking, which is what
  // keeps the exemption honest: it is the glossary granting it, not the checker.
  test("the glossary is what grants that exemption", () => {
    expect(
      findSpanishProseInSource({
        contents: `// Shared across the Bases del evento routes.`,
        filePath,
      }),
    ).not.toEqual([]);
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

  test("leaves an English test name alone, Spanish nouns included", () => {
    expect(
      kindsIn(
        `test("refuses to move the price that covers its seña", () => {});`,
      ),
    ).toEqual([]);
    expect(
      kindsIn(`test("collects Bases del evento breadcrumbs", () => {});`),
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
});
