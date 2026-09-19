import { describe, expect, test } from "vitest";

import { readGlossaryNouns } from "./check-comment-language";
import { checkPrTitle, conventionalTypes } from "./check-pr-title";

const glossaryNouns = readGlossaryNouns(process.cwd());

function rulesBrokenBy(title: string): string[] {
  return checkPrTitle({ glossaryNouns, title }).map(
    (violation) => violation.rule,
  );
}

describe("PR-title gate (#1007)", () => {
  test("passes a conventional title with an English subject", () => {
    expect(
      rulesBrokenBy(
        "feat(forms): keep views mounted when a submit fails unexpectedly",
      ),
    ).toEqual([]);
  });

  // #824 is the one title in the repo's history this gate would have caught.
  test("fails a title with no conventional prefix", () => {
    expect(rulesBrokenBy("worktree shadcn upstream sync")).toEqual([
      "conventional prefix",
    ]);
  });

  test("fails a Spanish subject", () => {
    expect(
      rulesBrokenBy(
        "fix(flash): firmar siempre la cookie de flash notifications",
      ),
    ).toEqual(["english subject"]);
  });

  test("accepts every type the history uses, bang and scope included", () => {
    for (const type of conventionalTypes) {
      expect(rulesBrokenBy(`${type}: rename the seed helper`)).toEqual([]);
      expect(rulesBrokenBy(`${type}(db)!: rename the seed helper`)).toEqual([]);
    }
  });

  test("rejects a type the history does not use", () => {
    expect(rulesBrokenBy("style: reformat the table")).toEqual([
      "conventional prefix",
    ]);
    expect(rulesBrokenBy("feature: add the table")).toEqual([
      "conventional prefix",
    ]);
  });

  test("rejects the shapes around the separator", () => {
    expect(rulesBrokenBy("feat:no space after the colon")).toEqual([
      "conventional prefix",
    ]);
    expect(rulesBrokenBy("feat: ")).toEqual(["conventional prefix"]);
    expect(rulesBrokenBy("")).toEqual(["conventional prefix"]);
    expect(rulesBrokenBy("feat (forms): keep views mounted")).toEqual([
      "conventional prefix",
    ]);
  });

  // The scope is free-form — `feat(finanzas)` is live in the history — so the
  // language rule only ever reads what follows the separator.
  test("leaves a Spanish scope alone", () => {
    expect(
      rulesBrokenBy("feat(finanzas): show the outstanding balance per academy"),
    ).toEqual([]);
  });

  // The glossary is what keeps a domain noun out of the language rule.
  test("allows the glossary nouns a subject legitimately names", () => {
    expect(
      rulesBrokenBy("feat(portal): upload a comprobante from the dancer view"),
    ).toEqual([]);
    expect(
      rulesBrokenBy('fix(admin): sort the "Bailarín" column by surname'),
    ).toEqual([]);
  });

  test("reports the rule and an accepted example, so the failure is actionable", () => {
    const [violation] = checkPrTitle({
      glossaryNouns,
      title: "worktree shadcn upstream sync",
    });

    expect(violation.message).toContain("worktree shadcn upstream sync");
    expect(violation.message).toContain("feat(forms):");
  });

  // The subject comes off the conventional grammar, not off the first `": "` in
  // the string, so neither rule can be fooled by a colon that is not the
  // separator: a scope may hold one, and a title with no prefix may hold one.
  test("reads the subject past a colon inside the scope", () => {
    expect(
      rulesBrokenBy("refactor(admin: finanzas): rename the seed helper"),
    ).toEqual([]);
    expect(
      rulesBrokenBy("refactor(admin: la vista de pagos): rename the helper"),
    ).toEqual([]);
  });

  test("language-checks the whole of a title whose colon is not a separator", () => {
    expect(
      rulesBrokenBy("Bailarín: agregar la vista de inscripciones"),
    ).toEqual(["conventional prefix", "english subject"]);
  });

  test("reports both rules when a title breaks both", () => {
    expect(rulesBrokenBy("agregar la vista de inscripciones")).toEqual([
      "conventional prefix",
      "english subject",
    ]);
  });
});
