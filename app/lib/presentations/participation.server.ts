import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  categories,
  choreographies,
  choreographyDancers,
  dancers,
  events,
  modalities,
  presentations,
  schedules,
  submodalities,
} from "@/db/schema";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import { notWithdrawnChoreography } from "@/lib/choreographies/withdrawn-choreography";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";
import type { ChoreographyFinancialStatus } from "@/lib/finances/inscription-financial-status";
import { readEventChoreographyFinancialStatuses } from "@/lib/finances/operational-summary.server";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import { findEvaluatedChoreographyIds } from "@/lib/presentations/evaluation-lock.server";
import {
  computeAutomaticOrder,
  isPresentationEligible,
  movePosition,
  type PresentationOrderingRow,
} from "@/lib/presentations/ordering";
import type { PresentationWarningRow } from "@/lib/presentations/warnings";

/**
 * The event's participation list and the one write that rebuilds it. Every row
 * carries what the order is derived from — the block, the active dancers and
 * the financial status — so the pure core in ordering.ts and warnings.ts never
 * reads the database. See docs/domain/judging.md, "Participation And Judging".
 */

export type ParticipationRow = PresentationOrderingRow &
  PresentationWarningRow & {
    academyName: string;
    modalityName: string;
    name: string;
    /** `null` while the choreography has no presentation. */
    presentationId: string | null;
    submodalityName: string | null;
  };

/**
 * `notOrdered`: the event has no presentation yet, so there is no order to move
 * within. `stale`: the row's number is not the one the client moved it from.
 */
export type MovePresentationResult =
  | { ok: true; movedToOrderNumber: number }
  | { ok: false; reason: "notFound" | "notOrdered" | "stale" };

export type AutomaticOrderingResult =
  | { ok: true; orderedCount: number }
  | { ok: false; reason: "evaluated" | "nothingToOrder" };

/**
 * Every choreography that is part of the order or can enter it: one that has a
 * presentation, whatever its money says, and one that is at least `Señada`.
 * A choreography below the deposit that was never numbered is not listed, and
 * neither is a withdrawn one — it will not be performed, so no filter of this
 * list brings it back.
 *
 * The result is the reading order of the list: the numbered rows by their
 * number, the rest after them by choreography number.
 */
export async function readParticipationRows(
  eventId: string,
  executor: Executor = db,
): Promise<ParticipationRow[]> {
  const [rows, financialStatuses] = await Promise.all([
    executor
      .select({
        academyName: academies.name,
        categoryMaxAge: categories.maxAge,
        categoryMinAge: categories.minAge,
        categoryName: categories.name,
        choreographyId: choreographies.id,
        choreographyNumber: choreographies.choreographyNumber,
        experienceLevel: choreographies.experienceLevelId,
        groupType: choreographies.groupType,
        modalityName: modalities.name,
        name: choreographies.name,
        orderNumber: presentations.orderNumber,
        presentationId: presentations.id,
        scheduleId: schedules.id,
        scheduleName: schedules.name,
        scheduleStartTime: schedules.startTime,
        scheduledDate: schedules.scheduledDate,
        submodalityName: submodalities.name,
      })
      .from(choreographies)
      .innerJoin(academies, eq(choreographies.academyId, academies.id))
      .innerJoin(modalities, eq(choreographies.modalityId, modalities.id))
      .leftJoin(
        submodalities,
        eq(choreographies.submodalityId, submodalities.id),
      )
      // Both joins are inner and both read the choreography's own column: a
      // choreography always has a category and a schedule, and the schedule is
      // never reached through `scheduleCapacityId`, which stays nullable.
      .innerJoin(categories, eq(choreographies.categoryId, categories.id))
      .innerJoin(schedules, eq(choreographies.scheduleId, schedules.id))
      .leftJoin(
        presentations,
        eq(presentations.choreographyId, choreographies.id),
      )
      .where(
        and(eq(choreographies.eventId, eventId), notWithdrawnChoreography()),
      ),
    readEventChoreographyFinancialStatuses(eventId, executor),
  ]);

  const activeDancersByChoreography = await readActiveDancers(
    executor,
    rows.map((row) => row.choreographyId),
  );

  return rows
    .map((row) => {
      const activeDancers =
        activeDancersByChoreography.get(row.choreographyId) ?? [];

      return {
        academyName: row.academyName,
        activeDancerIds: activeDancers.map((dancer) => dancer.id),
        activeDancers,
        category: {
          maxAge: row.categoryMaxAge,
          minAge: row.categoryMinAge,
          name: row.categoryName,
        },
        choreographyId: row.choreographyId,
        choreographyNumber: row.choreographyNumber,
        experienceLevel: row.experienceLevel,
        financialStatus:
          financialStatuses.get(row.choreographyId) ??
          ("depositPending" as ChoreographyFinancialStatus),
        groupType: row.groupType as ChoreographyGroupType,
        modalityName: row.modalityName,
        name: row.name,
        orderNumber: row.orderNumber,
        presentationId: row.presentationId,
        schedule: {
          id: row.scheduleId,
          name: row.scheduleName,
          scheduledDate: row.scheduledDate,
          startTime: row.scheduleStartTime,
        },
        submodalityName: row.submodalityName,
      } satisfies ParticipationRow;
    })
    .filter((row) => row.orderNumber !== null || isPresentationEligible(row))
    .sort(compareParticipationRows);
}

/**
 * The whole event ordered again from the rule. It is one transaction over the
 * event row taken `FOR UPDATE` — the `event_sequence` precedent — so two
 * administrators pressing the action at once do not interleave.
 *
 * Existing presentations are updated in place, keeping their id and everything
 * hanging off it; the late eligible ones are inserted; nothing is deleted. A
 * number is not taken away from a choreography that fell below its deposit
 * after being numbered.
 */
export async function runAutomaticOrdering(
  eventId: string,
): Promise<AutomaticOrderingResult> {
  return await db.transaction(async (tx) => {
    const [lockedEvent] = await tx
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, eventId))
      .for("update");

    if (!lockedEvent) {
      return { ok: false, reason: "nothingToOrder" };
    }

    const rows = await readParticipationRows(eventId, tx);
    const evaluatedChoreographyIds = await findEvaluatedChoreographyIds(
      rows
        .filter((row) => row.presentationId !== null)
        .map((row) => row.choreographyId),
      tx,
    );

    if (evaluatedChoreographyIds.size > 0) {
      return { ok: false, reason: "evaluated" };
    }

    const order = computeAutomaticOrder(rows);

    if (!order.ok) {
      return { ok: false, reason: order.reason };
    }

    const rowByChoreographyId = new Map(
      rows.map((row) => [row.choreographyId, row]),
    );

    // The rows are renumbered in place, walking through states where two of
    // them share a number: the unique constraint is deferred, so it is checked
    // once, at commit, against the contiguous state written here.
    let orderNumber = 0;

    for (const choreographyId of order.choreographyIds) {
      orderNumber += 1;
      const row = rowByChoreographyId.get(choreographyId);

      if (row?.presentationId) {
        await tx
          .update(presentations)
          .set({ orderNumber, updatedAt: new Date() })
          .where(eq(presentations.id, row.presentationId));
        continue;
      }

      await tx
        .insert(presentations)
        .values({ choreographyId, eventId, orderNumber });
    }

    return { ok: true, orderedCount: order.choreographyIds.length };
  });
}

/** The reading order of the list: numbered first, then the rest. */
function compareParticipationRows(
  left: ParticipationRow,
  right: ParticipationRow,
) {
  if (left.orderNumber !== null && right.orderNumber !== null) {
    return left.orderNumber - right.orderNumber;
  }

  if (left.orderNumber !== right.orderNumber) {
    return left.orderNumber === null ? 1 : -1;
  }

  return left.choreographyNumber - right.choreographyNumber;
}

async function readActiveDancers(
  executor: Executor,
  choreographyIds: string[],
) {
  const byChoreography = new Map<string, { id: string; name: string }[]>();

  if (choreographyIds.length === 0) {
    return byChoreography;
  }

  const rows = await executor
    .select({
      choreographyId: choreographyDancers.choreographyId,
      dancerId: dancers.id,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
    })
    .from(choreographyDancers)
    .innerJoin(dancers, eq(choreographyDancers.dancerId, dancers.id))
    .where(
      and(
        inArray(choreographyDancers.choreographyId, choreographyIds),
        activeInscription(),
      ),
    );

  for (const row of rows) {
    const bucket = byChoreography.get(row.choreographyId) ?? [];
    bucket.push({
      id: row.dancerId,
      name: `${row.firstName} ${row.lastName}`,
    });
    byChoreography.set(row.choreographyId, bucket);
  }

  return byChoreography;
}

/**
 * One presentation placed by hand, under the same event lock as the automatic
 * ordering. `fromOrderNumber` is what the client believed the row's number was:
 * when it no longer holds the move is refused and nothing is written, so two
 * administrators dragging at once never silently overwrite each other.
 *
 * A move always renumbers the whole event contiguously from 1, which is also
 * how the gaps left by a deleted choreography are closed.
 */
export async function movePresentation(input: {
  choreographyId: string;
  eventId: string;
  fromOrderNumber: number | null;
  toOrderNumber: number;
}): Promise<MovePresentationResult> {
  return await db.transaction(async (tx) => {
    const [lockedEvent] = await tx
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, input.eventId))
      .for("update");

    if (!lockedEvent) {
      return { ok: false, reason: "notFound" };
    }

    const rows = await readParticipationRows(input.eventId, tx);
    const numbered = rows
      .filter(
        (row): row is ParticipationRow & { orderNumber: number } =>
          row.orderNumber !== null,
      )
      .sort((left, right) => left.orderNumber - right.orderNumber);

    // Placing by hand is only offered once the event has been ordered: before
    // that there is no order for a number to mean anything against.
    if (numbered.length === 0) {
      return { ok: false, reason: "notOrdered" };
    }

    // A row below its deposit that was never numbered is not in the list at
    // all, so a late row that cannot be placed is refused by not being found.
    const row = rows.find(
      (candidate) => candidate.choreographyId === input.choreographyId,
    );

    if (!row) {
      return { ok: false, reason: "notFound" };
    }

    if (row.orderNumber !== input.fromOrderNumber) {
      return { ok: false, reason: "stale" };
    }

    const orderedIds = movePosition(
      numbered.map((candidate) => candidate.choreographyId),
      input.choreographyId,
      input.toOrderNumber - 1,
    );
    const presentationIdByChoreography = new Map(
      rows.map((candidate) => [
        candidate.choreographyId,
        candidate.presentationId,
      ]),
    );
    const currentNumberByChoreography = new Map(
      rows.map((candidate) => [
        candidate.choreographyId,
        candidate.orderNumber,
      ]),
    );

    // The unique constraint is deferred, so the intermediate states this walks
    // through are never checked — only the contiguous one it commits.
    let orderNumber = 0;

    for (const choreographyId of orderedIds) {
      orderNumber += 1;
      const presentationId = presentationIdByChoreography.get(choreographyId);

      if (presentationId) {
        if (currentNumberByChoreography.get(choreographyId) === orderNumber) {
          continue;
        }

        await tx
          .update(presentations)
          .set({ orderNumber, updatedAt: new Date() })
          .where(eq(presentations.id, presentationId));
        continue;
      }

      await tx
        .insert(presentations)
        .values({ choreographyId, eventId: input.eventId, orderNumber });
    }

    return {
      ok: true,
      movedToOrderNumber: orderedIds.indexOf(input.choreographyId) + 1,
    };
  });
}
