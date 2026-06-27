import { and, asc, eq, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  scheduleCapacities,
  schedules,
} from "@/db/schema";
import type { AdministrativeDancerInscription } from "@/lib/admin/dancers/dancers.server.types";
import { resolveApplicablePrice } from "@/lib/events/bases-repository.server";

export async function findAdministrativeDancerInscriptions(input: {
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
      groupType: choreographies.groupType,
      scheduleId: schedules.id,
    })
    .from(choreographyDancers)
    .innerJoin(
      choreographies,
      eq(choreographies.id, choreographyDancers.choreographyId),
    )
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
      ),
    )
    .orderBy(asc(sql`lower(${choreographies.name})`));

  const inscriptions = await Promise.all(
    choreographyRows.map(async (choreography) => {
      const priceResult = await resolveApplicablePrice({
        eventId: selectedEventId,
        groupType: choreography.groupType,
        scheduleId: choreography.scheduleId,
      });
      const priceAmount = priceResult.ok ? priceResult.price.amount : null;

      return {
        id: choreography.id,
        choreographyName: choreography.name,
        groupType: choreography.groupType,
        basePriceAmount: priceAmount,
        discountAmount: 0,
        estimatedSubtotalAmount: priceAmount,
      } satisfies AdministrativeDancerInscription;
    }),
  );

  return {
    choreographyRows,
    inscriptions,
  };
}
