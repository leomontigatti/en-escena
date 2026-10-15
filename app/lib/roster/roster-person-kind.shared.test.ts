import { describe, expect, test } from "vitest";

import { toPortalSeminarPersonGroups } from "@/features/portal/seminars/shared";
import { getRosterMergeKindCopy } from "@/lib/roster/roster-merge.shared";
import {
  getRosterPersonNotFoundMessage,
  rosterPersonListPath,
} from "@/lib/roster/roster-person-kind.shared";
import { getRosterPersonRejectionMessage } from "@/lib/roster/roster-person-rejection";
import { getRosterPersonParticipatingMessage } from "@/lib/roster/roster-person-status.shared";

// #1479: nine per-kind label maps became one noun vocabulary. Every row is a
// string on screen before the fold, character for character, so a wrong noun
// form or a lost period fails here rather than in a review of the copy.
describe("the roster person kind vocabulary preserves the copy it replaced (#1479)", () => {
  test.each([
    {
      kind: "dancer",
      sentences: {
        notFound: "No encontramos ese bailarín.",
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
        notFound: "No encontramos ese profesor.",
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

  test("titles the portal picker's sections in the order and words they had", () => {
    expect(
      toPortalSeminarPersonGroups([
        { id: "p", kind: "professor", fullName: "Beto Luna" },
        { id: "d", kind: "dancer", fullName: "Abril Sosa" },
      ]).map((group) => group.label),
    ).toEqual(["Bailarines", "Profesores"]);
  });
});
