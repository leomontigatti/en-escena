import { and, asc, eq, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  choreographies,
  choreographyDancers,
  scheduleCapacities,
  schedules,
} from "@/db/schema";
import type { DancerInscription } from "@/lib/dancers/inscriptions";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import {
  type InscriptionThresholdResolution,
  readInscriptionThresholds,
} from "@/lib/finances/inscription-thresholds.server";

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
      groupType: choreographies.groupType,
      scheduleId: schedules.id,
      academyId: choreographies.academyId,
      inscriptionId: choreographyDancers.id,
    })
    .from(choreographyDancers)
    .innerJoin(
      choreographies,
      eq(choreographies.id, choreographyDancers.choreographyId),
    )
    .leftJoin(categories, eq(choreographies.categoryId, categories.id))
    .leftJoin(
      scheduleCapacities,
      eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
    )
    .innerJoin(
      schedules,
      or(
        eq(choreographies.scheduleId, schedules.id),
        eq(scheduleCapacities.scheduleId, schedules.id),
      ),
    )
    .where(
      and(
        eq(choreographyDancers.dancerId, input.dancerId),
        eq(choreographies.eventId, selectedEventId),
        activeInscription(),
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

    return {
      id: choreography.id,
      choreographyName: choreography.name,
      choreographyNumber: choreography.choreographyNumber,
      categoryName: choreography.categoryName,
      groupType: choreography.groupType,
      basePriceAmount: resolution?.priceAmount ?? null,
      discountAmount: resolution?.dancerDiscountAmount ?? 0,
      totalAmount: resolution?.totalAmount ?? null,
    } satisfies DancerInscription;
  });

  return {
    choreographyRows,
    inscriptions,
  };
}
