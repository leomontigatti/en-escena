import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  finalistPicks,
  judgeAssignments,
  modalities,
  presentations,
  user,
} from "@/db/schema";
import { grandFinalEligibility } from "@/lib/grand-final/eligibility.server";
import { readAcademyNames } from "@/lib/grand-final/finalist-pick.server";

/**
 * What administration's `Gran final` list reads: every modality of the event,
 * the academies eligible in it with the judges who picked each, and which of
 * them are `finalist`s. Everything is derived on read from the picks and from
 * `grandFinalEligibility`; nothing here is stored.
 */

/** One of the event's judges, a column of the list. */
export type GrandFinalJudge = { id: string; name: string };

export type GrandFinalAcademyRow = {
  academyId: string;
  /**
   * False only for an academy that is listed because a judge picked it and
   * has stopped being eligible since: the pick stays until it is changed.
   */
  eligible: boolean;
  /** Picked by some judge in any modality, unweighted (`finalist`). */
  finalist: boolean;
  name: string;
  /** The judges whose pick in this modality is this academy, by name. */
  pickedByJudgeIds: string[];
};

export type GrandFinalModalityRow = {
  academies: GrandFinalAcademyRow[];
  modalityId: string;
  modalityName: string;
};

export type GrandFinalPicks = {
  judges: GrandFinalJudge[];
  modalities: GrandFinalModalityRow[];
};

export async function readGrandFinalPicks(
  eventId: string,
): Promise<GrandFinalPicks> {
  const [eventModalities, eligible, picks, judges] = await Promise.all([
    db
      .select({ id: modalities.id, name: modalities.name })
      .from(modalities)
      .where(eq(modalities.eventId, eventId))
      .orderBy(asc(modalities.name)),
    grandFinalEligibility(eventId),
    db
      .select({
        academyId: finalistPicks.academyId,
        judgeId: finalistPicks.judgeId,
        modalityId: finalistPicks.modalityId,
      })
      .from(finalistPicks)
      .where(eq(finalistPicks.eventId, eventId)),
    readEventJudges(eventId),
  ]);
  const names = await readAcademyNames([
    ...eligible.map((pair) => pair.academyId),
    ...picks.map((pick) => pick.academyId),
  ]);
  const finalistIds = new Set(picks.map((pick) => pick.academyId));
  const judgeOrder = judges.map((judge) => judge.id);

  return {
    judges,
    modalities: eventModalities.map((modality) => {
      const eligibleIds = eligible
        .filter((pair) => pair.modalityId === modality.id)
        .map((pair) => pair.academyId);
      const modalityPicks = picks.filter(
        (pick) => pick.modalityId === modality.id,
      );
      const academyIds = new Set([
        ...eligibleIds,
        ...modalityPicks.map((pick) => pick.academyId),
      ]);

      return {
        academies: [...academyIds]
          .map((academyId) => ({
            academyId,
            eligible: eligibleIds.includes(academyId),
            finalist: finalistIds.has(academyId),
            name: names.get(academyId) ?? "",
            pickedByJudgeIds: modalityPicks
              .filter((pick) => pick.academyId === academyId)
              .map((pick) => pick.judgeId)
              .sort(
                (left, right) =>
                  judgeOrder.indexOf(left) - judgeOrder.indexOf(right),
              ),
          }))
          .sort((left, right) => left.name.localeCompare(right.name, "es")),
        modalityId: modality.id,
        modalityName: modality.name,
      };
    }),
  };
}

/**
 * The event's judges: the ones assigned to one of its presentations, and any
 * who holds a pick in it, so a judge taken off every presentation still shows
 * the pick they made. A judge user with no tie to the event is not one of its
 * columns.
 */
async function readEventJudges(eventId: string): Promise<GrandFinalJudge[]> {
  const [assigned, picking] = await Promise.all([
    db
      .selectDistinct({ id: user.id, name: user.name })
      .from(judgeAssignments)
      .innerJoin(
        presentations,
        eq(presentations.id, judgeAssignments.presentationId),
      )
      .innerJoin(user, eq(user.id, judgeAssignments.userId))
      .where(eq(presentations.eventId, eventId)),
    db
      .selectDistinct({ id: user.id, name: user.name })
      .from(finalistPicks)
      .innerJoin(user, eq(user.id, finalistPicks.judgeId))
      .where(eq(finalistPicks.eventId, eventId)),
  ]);
  const byId = new Map(
    [...assigned, ...picking].map((judge) => [judge.id, judge]),
  );

  return [...byId.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "es"),
  );
}
