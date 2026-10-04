import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  choreographies,
  choreographyProfessors,
  events,
  seminarInscriptions,
  seminars,
} from "@/db/schema";
import { resolveSeminarInscriptions } from "@/lib/finances/seminar-inscription-thresholds.server";
import type {
  RosterChoreography,
  RosterSeminarInscription,
} from "@/lib/roster/inscriptions";
import type { RosterPersonKind } from "@/lib/roster/roster-person-status.shared";

/**
 * The choreographies a professor is linked to in the selected event. A link
 * carries no money, so the row is the choreography itself; a withdrawn
 * choreography stays on the tab as evidence.
 */
export async function findProfessorChoreographies(input: {
  professorId: string;
  selectedEventId: string | null;
}): Promise<RosterChoreography[]> {
  if (input.selectedEventId === null) {
    return [];
  }

  const rows = await db
    .select({
      id: choreographies.id,
      choreographyName: choreographies.name,
      choreographyNumber: choreographies.choreographyNumber,
      eventName: events.name,
      categoryName: categories.name,
      groupType: choreographies.groupType,
    })
    .from(choreographyProfessors)
    .innerJoin(
      choreographies,
      eq(choreographies.id, choreographyProfessors.choreographyId),
    )
    .innerJoin(categories, eq(choreographies.categoryId, categories.id))
    .innerJoin(events, eq(choreographies.eventId, events.id))
    .where(
      and(
        eq(choreographyProfessors.professorId, input.professorId),
        eq(choreographies.eventId, input.selectedEventId),
      ),
    )
    .orderBy(asc(sql`lower(${choreographies.name})`));

  return rows;
}

/**
 * The seminar inscriptions a dancer or a professor holds in the selected event,
 * withdrawn ones included, priced by the same resolution every seminar money
 * surface reads, so this tab and the finance detail cannot quote two figures
 * for one inscription.
 */
export async function findRosterSeminarInscriptions(input: {
  person: { id: string; kind: RosterPersonKind };
  selectedEventId: string | null;
}): Promise<RosterSeminarInscription[]> {
  if (input.selectedEventId === null) {
    return [];
  }

  const personColumn =
    input.person.kind === "dancer"
      ? seminarInscriptions.dancerId
      : seminarInscriptions.professorId;
  const rows = await db
    .select({
      dancerId: seminarInscriptions.dancerId,
      eventName: events.name,
      id: seminarInscriptions.id,
      instructorName: seminars.instructorName,
      professorId: seminarInscriptions.professorId,
      requiredDepositPercentage: seminars.requiredDepositPercentage,
      scheduledDate: seminars.scheduledDate,
      seminarId: seminarInscriptions.seminarId,
      seminarKind: seminars.kind,
      selectedPriceId: seminarInscriptions.selectedPriceId,
      startTime: seminars.startTime,
      withdrawnAt: seminarInscriptions.withdrawnAt,
    })
    .from(seminarInscriptions)
    .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
    .innerJoin(events, eq(seminars.eventId, events.id))
    .where(
      and(
        eq(personColumn, input.person.id),
        eq(seminars.eventId, input.selectedEventId),
      ),
    )
    .orderBy(
      asc(sql`lower(${seminars.instructorName})`),
      asc(seminars.scheduledDate),
      asc(seminars.startTime),
    );
  const resolutions = await resolveSeminarInscriptions(db, {
    eventId: input.selectedEventId,
    rows,
  });

  return rows.map((row) => ({
    id: row.id,
    seminarId: row.seminarId,
    instructorName: row.instructorName,
    eventName: row.eventName,
    kind: row.seminarKind,
    scheduledDate: row.scheduledDate,
    startTime: row.startTime,
    totalAmount: resolutions.get(row.id)?.totalAmount ?? null,
  }));
}
