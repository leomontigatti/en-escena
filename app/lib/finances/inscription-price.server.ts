import { and, eq } from "drizzle-orm";

import { prices } from "@/db/schema";
import type { PriceResolutionResult } from "@/lib/events/bases-repository/shared.server";
import { isGroupType } from "@/lib/events/group-types";
import { selectApplicableInscriptionPrice } from "@/lib/finances/inscription-price";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

import type { Executor } from "./choreography-cobro-support.server";

/**
 * `selectApplicableInscriptionPrice` from the database, for a caller that has
 * not already loaded the event's price rows. Same rule, same business date: it
 * loads the group type's rows of both tiers in one query and hands them to the
 * pure owner, so there is no second composition to drift.
 *
 * `missing-price` here is the vocabulary a guard fails with, not a state an
 * inscription is in: an inscription with no applicable row and no stored one
 * exists and reads `Sin precio`.
 */
export async function resolveApplicableInscriptionPrice(
  executor: Executor,
  input: {
    eventId: string;
    groupType: string;
    scheduleId: string | null;
  },
): Promise<PriceResolutionResult> {
  if (!isGroupType(input.groupType)) {
    return {
      ok: false,
      code: "invalid-group-type",
      error: "No se pudo resolver el precio para ese tipo de grupo.",
    };
  }

  const priceRows = await executor.query.prices.findMany({
    where: and(
      eq(prices.eventId, input.eventId),
      eq(prices.groupType, input.groupType),
    ),
  });
  const price = selectApplicableInscriptionPrice({
    businessDate: getBusinessDateOnly(),
    key: {
      choreographyScheduleId: input.scheduleId,
      groupType: input.groupType,
      scheduleCapacityScheduleId: null,
    },
    priceRows,
  });

  if (price) {
    return { ok: true, price };
  }

  return {
    ok: false,
    code: "missing-price",
    error: "No hay un precio configurado para este tipo de grupo y cronograma.",
  };
}
