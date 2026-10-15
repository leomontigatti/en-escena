import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  categories,
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  events,
  modalities,
  submodalities,
} from "@/db/schema";
import { requireIndividualUser } from "@/lib/auth/internal-access.server";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import { notWithdrawnChoreography } from "@/lib/choreographies/withdrawn-choreography";
import { listIndividualLinkedRosterRows } from "@/lib/individuals/link.server";
import {
  deriveIndividualLinkState,
  type IndividualLinkState,
} from "@/lib/individuals/link-state";
import type { Award } from "@/lib/judging/award";
import {
  readPresentationJudgeValues,
  readPresentationResults,
  type PresentationJudgeValue,
} from "@/lib/judging/presentation-results.server";
import { readPublishedResultChoreographyIds } from "@/lib/judging/results.server";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import type { RosterPersonKind } from "@/lib/roster/roster-person-kind.shared";

/**
 * `Coreografías` (ADR-0019): the active event's choreographies the
 * individual takes part in, in any academy, read through the rows its link
 * reaches and nothing else. A row reaches a choreography as a dancer with an
 * inscription that is not withdrawn, or as a professor linked to it.
 *
 * A result is what the owning academy reads on its evaluation, behind the
 * same publication gate: the award, the average and each judge's score, with
 * every figure dropped on a disqualified presentation. The sheet breakdown and
 * the `Devolución` stay the academy's and are not read here.
 */

export type IndividualChoreographyResult = {
  /** Null for a disqualified presentation and when nothing counts. */
  average: number | null;
  award: Award | null;
  disqualified: boolean;
  /** Each judge who saved a score; none when disqualified. */
  scores: PresentationJudgeValue[];
};

export type IndividualChoreographyRow = {
  academyName: string;
  categoryName: string;
  choreographyId: string;
  groupType: ChoreographyGroupType;
  modalityName: string;
  name: string;
  /** How the individual takes part: as a dancer, a professor or both. */
  roles: RosterPersonKind[];
  /** Null until the result is published. */
  result: IndividualChoreographyResult | null;
  submodalityName: string | null;
};

export type IndividualChoreographiesLoaderData = {
  choreographies: IndividualChoreographyRow[];
  hasActiveEvent: boolean;
  /** Why the list is empty when it is not `linked`. */
  linkState: IndividualLinkState;
};

export async function loadIndividualChoreographies(
  request: Request,
): Promise<IndividualChoreographiesLoaderData> {
  const { individual } = await requireIndividualUser(request);
  const linkState = deriveIndividualLinkState(individual);
  const activeEvent = await db.query.events.findFirst({
    columns: { id: true },
    where: eq(events.active, true),
    orderBy: [desc(events.startsAt)],
  });

  if (!activeEvent || linkState !== "linked") {
    return {
      choreographies: [],
      hasActiveEvent: activeEvent !== undefined,
      linkState,
    };
  }

  // The link reaches archived rows too (an admin reads them before
  // confirming); a row its academy archived takes no part in the event here.
  const rows = (await listIndividualLinkedRosterRows(individual)).filter(
    (row) => row.status === "active",
  );
  const dancerIds = rows
    .filter((row) => row.kind === "dancer")
    .map((row) => row.id);
  const professorIds = rows
    .filter((row) => row.kind === "professor")
    .map((row) => row.id);
  const choreographyRows = await readTakingPartChoreographies({
    dancerIds,
    eventId: activeEvent.id,
    professorIds,
  });
  const results = await readPublishedResults(
    choreographyRows.map((row) => row.choreographyId),
  );

  return {
    choreographies: choreographyRows.map((row) => ({
      ...row,
      result: results.get(row.choreographyId) ?? null,
    })),
    hasActiveEvent: true,
    linkState,
  };
}

async function readTakingPartChoreographies(input: {
  dancerIds: string[];
  eventId: string;
  professorIds: string[];
}): Promise<Omit<IndividualChoreographyRow, "result">[]> {
  if (input.dancerIds.length === 0 && input.professorIds.length === 0) {
    return [];
  }

  const [danced, taught] = await Promise.all([
    input.dancerIds.length === 0
      ? []
      : db
          .selectDistinct({
            choreographyId: choreographyDancers.choreographyId,
          })
          .from(choreographyDancers)
          .where(
            and(
              inArray(choreographyDancers.dancerId, input.dancerIds),
              activeInscription(),
            ),
          ),
    input.professorIds.length === 0
      ? []
      : db
          .selectDistinct({
            choreographyId: choreographyProfessors.choreographyId,
          })
          .from(choreographyProfessors)
          .where(
            inArray(choreographyProfessors.professorId, input.professorIds),
          ),
  ]);
  const dancedIds = new Set(danced.map((row) => row.choreographyId));
  const taughtIds = new Set(taught.map((row) => row.choreographyId));

  if (dancedIds.size === 0 && taughtIds.size === 0) {
    return [];
  }

  const rows = await db
    .select({
      academyName: academies.name,
      categoryName: categories.name,
      choreographyId: choreographies.id,
      groupType: choreographies.groupType,
      modalityName: modalities.name,
      name: choreographies.name,
      submodalityName: submodalities.name,
    })
    .from(choreographies)
    .innerJoin(academies, eq(academies.id, choreographies.academyId))
    .innerJoin(categories, eq(categories.id, choreographies.categoryId))
    .innerJoin(modalities, eq(modalities.id, choreographies.modalityId))
    .leftJoin(submodalities, eq(submodalities.id, choreographies.submodalityId))
    .where(
      and(
        eq(choreographies.eventId, input.eventId),
        notWithdrawnChoreography(),
        inArray(choreographies.id, [...dancedIds, ...taughtIds]),
      ),
    )
    .orderBy(asc(academies.name), asc(choreographies.name));

  return rows.map((row) => ({
    ...row,
    groupType: row.groupType as ChoreographyGroupType,
    roles: [
      ...(dancedIds.has(row.choreographyId) ? (["dancer"] as const) : []),
      ...(taughtIds.has(row.choreographyId) ? (["professor"] as const) : []),
    ],
  }));
}

/** Only the published ones come back, through the academies' own gate. */
async function readPublishedResults(
  choreographyIds: string[],
): Promise<Map<string, IndividualChoreographyResult>> {
  const publishedIds = [
    ...(await readPublishedResultChoreographyIds(choreographyIds)),
  ];
  const [results, judgeValues] = await Promise.all([
    readPresentationResults(publishedIds),
    readPresentationJudgeValues(publishedIds),
  ]);

  return new Map(
    publishedIds.flatMap((choreographyId) => {
      const result = results.get(choreographyId);

      if (!result) {
        return [];
      }

      const judges = judgeValues.get(choreographyId) ?? [];

      return [
        [
          choreographyId,
          {
            average: result.average,
            award: result.award,
            disqualified: result.disqualified,
            scores: result.disqualified ? [] : judges,
          },
        ],
      ];
    }),
  );
}
