import { describe, expect, test } from "vitest";

import { getRosterMergeKindCopy } from "@/lib/roster/roster-merge.shared";
import {
  getRosterPersonNotFoundMessage,
  rosterPersonKinds,
  rosterPersonListPath,
  rosterPersonNoun,
} from "@/lib/roster/roster-person-kind.shared";
import { getRosterPersonRejectionMessage } from "@/lib/roster/roster-person-rejection";
import { getRosterPersonParticipatingMessage } from "@/lib/roster/roster-person-status.shared";

// #1479: nine per-kind label maps became one noun vocabulary. Every row is a
// string on screen before the fold, character for character, so a wrong noun
// form or a lost period fails here rather than in a review of the copy.
describe("the roster person kind vocabulary preserves the copy it replaced (#1479)", () => {
  test.each([
    ["dancer", "singular", "bailarín"],
    ["dancer", "singularCapitalized", "Bailarín"],
    ["dancer", "plural", "bailarines"],
    ["dancer", "pluralCapitalized", "Bailarines"],
    ["professor", "singular", "profesor"],
    ["professor", "singularCapitalized", "Profesor"],
    ["professor", "plural", "profesores"],
    ["professor", "pluralCapitalized", "Profesores"],
  ] as const)("names a %s in the %s form as %s", (kind, form, noun) => {
    expect(rosterPersonNoun(kind, form)).toBe(noun);
  });

  test.each([
    {
      kind: "dancer",
      sentences: {
        notFound: "No encontramos ese Bailarín.",
        participating:
          "Este bailarín no puede archivarse porque está participando del evento activo.",
        rejectedArchived:
          "Reactivá este bailarín para poder agregarlo a la coreografía.",
        rejectedNotFound: "Elegí bailarines que pertenezcan a tu academia.",
        mergeOtherAcademy:
          "Solo se pueden fusionar bailarines de la misma academia.",
        mergeSameRow: "Elegí otro bailarín para fusionar.",
        mergeSurvivorNotFound:
          "No encontramos el bailarín que queda. Elegí otro bailarín de la academia.",
        listPath: "/administracion/bailarines",
      },
    },
    {
      kind: "professor",
      sentences: {
        notFound: "No encontramos ese Profesor.",
        participating:
          "Este profesor no puede archivarse porque está participando del evento activo.",
        rejectedArchived:
          "Reactivá este profesor para poder agregarlo a la coreografía.",
        rejectedNotFound: "Elegí profesores que pertenezcan a tu academia.",
        mergeOtherAcademy:
          "Solo se pueden fusionar profesores de la misma academia.",
        mergeSameRow: "Elegí otro profesor para fusionar.",
        mergeSurvivorNotFound:
          "No encontramos el profesor que queda. Elegí otro profesor de la academia.",
        listPath: "/administracion/profesores",
      },
    },
  ] as const)(
    "composes the $kind sentences unchanged",
    ({ kind, sentences }) => {
      const merge = getRosterMergeKindCopy(kind);

      expect({
        notFound: getRosterPersonNotFoundMessage(kind),
        participating: getRosterPersonParticipatingMessage(kind),
        rejectedArchived: getRosterPersonRejectionMessage({
          kind,
          rejections: [{ personId: "a", cause: "archived" }],
        }),
        rejectedNotFound: getRosterPersonRejectionMessage({
          kind,
          rejections: [{ personId: "a", cause: "not-found" }],
        }),
        mergeOtherAcademy: merge.otherAcademyMessage,
        mergeSameRow: merge.sameRowMessage,
        mergeSurvivorNotFound: merge.survivorNotFoundMessage,
        listPath: rosterPersonListPath(kind),
      }).toEqual(sentences);
    },
  );

  test("lists dancers before professors, the order every grouped surface shows", () => {
    expect(rosterPersonKinds).toEqual(["dancer", "professor"]);
  });
});
