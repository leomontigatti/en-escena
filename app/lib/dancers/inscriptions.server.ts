import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  choreographies,
  choreographyDancers,
  events,
  schedules,
} from "@/db/schema";
import type { DancerInscription } from "@/lib/dancers/inscriptions";
import { deriveInscriptionFinancialFigures } from "@/lib/finances/inscription-financial-status";
import {
  type InscriptionThresholdResolution,
  readInscriptionThresholds,
} from "@/lib/finances/inscription-thresholds.server";

/**
 * The choreography inscriptions a dancer holds in the selected event, withdrawn
 * ones included: the tab is one of the reads that show a withdrawn row as
 * evidence rather than hiding it.
 */
export async function findDancerInscriptions(input: {
  dancerId: string;
  selectedEventId: string | null;
}) {
  if (input.selectedEventId === null) {
    return {
      choreographyRows: [],
      inscriptions: [],
    };
  }

  const selectedEventId = input.selectedEventId;
  const choreographyRows = await db
    .select({
      id: choreographies.id,
      name: choreographies.name,
      choreographyNumber: choreographies.choreographyNumber,
      categoryName: categories.name,
      eventName: events.name,
      groupType: choreographies.groupType,
      scheduleId: schedules.id,
      academyId: choreographies.academyId,
      inscriptionId: choreographyDancers.id,
      withdrawnAt: choreographyDancers.withdrawnAt,
    })
    .from(choreographyDancers)
    .innerJoin(
      choreographies,
      eq(choreographies.id, choreographyDancers.choreographyId),
    )
    .innerJoin(categories, eq(choreographies.categoryId, categories.id))
    .innerJoin(schedules, eq(choreographies.scheduleId, schedules.id))
    .innerJoin(events, eq(choreographies.eventId, events.id))
    .where(
      and(
        eq(choreographyDancers.dancerId, input.dancerId),
        eq(choreographies.eventId, selectedEventId),
      ),
    )
    .orderBy(asc(sql`lower(${choreographies.name})`));

  // Priced by the finance read model — the row that applies on today's
  // business date, the stored row once the deposit is covered, the live
  // discount over the dancer's roster — so this tab shows the same figures as
  // the finance surfaces. The discount qualifies per academy, and a dancer
  // belongs to one, so every row shares the academy of the first.
  const academyId = choreographyRows[0]?.academyId;
  const thresholds = academyId
    ? await readInscriptionThresholds(db, {
        academyId,
        eventId: selectedEventId,
        inscriptionIds: choreographyRows.map((row) => row.inscriptionId),
      })
    : new Map<string, InscriptionThresholdResolution>();

  const inscriptions = choreographyRows.map((choreography) => {
    const resolution = thresholds.get(choreography.inscriptionId);
    const withdrawn = choreography.withdrawnAt !== null;
    // A withdrawn row's total is what remains allocated to it, which the
    // shared derivation owns; the thresholds alone would quote the price.
    const figures = resolution
      ? deriveInscriptionFinancialFigures({
          allocatedAmount: resolution.allocatedAmount,
          thresholds: resolution,
          withdrawn,
        })
      : null;

    return {
      id: choreography.id,
      choreographyName: choreography.name,
      choreographyNumber: choreography.choreographyNumber,
      eventName: choreography.eventName,
      categoryName: choreography.categoryName,
      groupType: choreography.groupType,
      basePriceAmount: resolution?.priceAmount ?? null,
      dancerDiscountAmount: resolution?.dancerDiscountAmount ?? 0,
      totalAmount: figures?.totalAmount ?? null,
    } satisfies DancerInscription;
  });

  return {
    choreographyRows,
    inscriptions,
  };
}
