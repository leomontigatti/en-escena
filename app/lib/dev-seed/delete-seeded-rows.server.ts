import { inArray, or } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  categories,
  choreographies,
  comprobantes,
  dancers,
  events,
  judgeAssignments,
  modalities,
  presentations,
  prices,
  professors,
  schedules,
  scores,
  seminarInscriptions,
  seminars,
  submodalities,
  user,
} from "@/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type SeededIds = Awaited<ReturnType<typeof collectSeededIds>>;

/**
 * Deletes the users with the given emails and the events with the given names,
 * with everything hanging off them — including rows created through the UI on
 * top of the demo, so a re-seed resets it rather than failing on a foreign key.
 *
 * Most of these foreign keys do not cascade, and the ones between two tables
 * that both cascade from the event (a schedule's modality link, a category's)
 * are checked before the cascade reaches the link. So every level is deleted
 * explicitly, children first, in one transaction.
 */
export async function deleteSeededRows(input: {
  emails: string[];
  eventNames: string[];
}) {
  await db.transaction(async (tx) => {
    const ids = await collectSeededIds(tx, input);

    await deleteRegistrationsAndJudging(tx, ids);
    // The user cascades to its academy, sessions, roster and payments.
    await tx.delete(user).where(inArray(user.id, ids.userIds));
    await deleteEventCatalogs(tx, ids.eventIds);
  });
}

async function collectSeededIds(
  tx: Transaction,
  input: { emails: string[]; eventNames: string[] },
) {
  const userIds = await selectIds(tx, user, inArray(user.email, input.emails));
  const academyIds = await selectIds(
    tx,
    academies,
    inArray(academies.userId, userIds),
  );
  const eventIds = await selectIds(
    tx,
    events,
    inArray(events.name, input.eventNames),
  );
  const choreographyIds = await selectIds(
    tx,
    choreographies,
    or(
      inArray(choreographies.eventId, eventIds),
      inArray(choreographies.academyId, academyIds),
    ),
  );
  const presentationIds = await selectIds(
    tx,
    presentations,
    or(
      inArray(presentations.eventId, eventIds),
      inArray(presentations.choreographyId, choreographyIds),
    ),
  );

  return {
    userIds,
    academyIds,
    eventIds,
    choreographyIds,
    presentationIds,
    assignmentIds: await selectIds(
      tx,
      judgeAssignments,
      or(
        inArray(judgeAssignments.presentationId, presentationIds),
        inArray(judgeAssignments.userId, userIds),
      ),
    ),
    dancerIds: await selectIds(
      tx,
      dancers,
      inArray(dancers.academyId, academyIds),
    ),
    professorIds: await selectIds(
      tx,
      professors,
      inArray(professors.academyId, academyIds),
    ),
    seminarIds: await selectIds(
      tx,
      seminars,
      inArray(seminars.eventId, eventIds),
    ),
  };
}

async function deleteRegistrationsAndJudging(tx: Transaction, ids: SeededIds) {
  await tx
    .delete(scores)
    .where(inArray(scores.judgeAssignmentId, ids.assignmentIds));
  await tx
    .delete(judgeAssignments)
    .where(inArray(judgeAssignments.id, ids.assignmentIds));
  await tx
    .delete(presentations)
    .where(inArray(presentations.id, ids.presentationIds));
  await tx
    .delete(comprobantes)
    .where(
      or(
        inArray(comprobantes.eventId, ids.eventIds),
        inArray(comprobantes.academyId, ids.academyIds),
      ),
    );
  await tx
    .delete(choreographies)
    .where(inArray(choreographies.id, ids.choreographyIds));
  await tx
    .delete(seminarInscriptions)
    .where(
      or(
        inArray(seminarInscriptions.seminarId, ids.seminarIds),
        inArray(seminarInscriptions.dancerId, ids.dancerIds),
        inArray(seminarInscriptions.professorId, ids.professorIds),
      ),
    );
}

async function deleteEventCatalogs(tx: Transaction, eventIds: string[]) {
  await tx.delete(prices).where(inArray(prices.eventId, eventIds));
  await tx.delete(schedules).where(inArray(schedules.eventId, eventIds));
  await tx.delete(categories).where(inArray(categories.eventId, eventIds));
  await tx
    .delete(submodalities)
    .where(inArray(submodalities.eventId, eventIds));
  await tx.delete(modalities).where(inArray(modalities.eventId, eventIds));
  await tx.delete(events).where(inArray(events.id, eventIds));
}

async function selectIds(
  tx: Transaction,
  table:
    | typeof user
    | typeof academies
    | typeof events
    | typeof choreographies
    | typeof presentations
    | typeof judgeAssignments
    | typeof dancers
    | typeof professors
    | typeof seminars,
  where: ReturnType<typeof inArray> | ReturnType<typeof or>,
) {
  const rows = await tx.select({ id: table.id }).from(table).where(where);

  return rows.map(({ id }) => id);
}
