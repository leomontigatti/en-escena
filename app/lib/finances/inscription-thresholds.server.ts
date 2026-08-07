import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  events,
  prices,
  scheduleCapacities,
} from "@/db/schema";
import {
  calculateDepositAmount,
  calculateTotalAmount,
  type InscriptionThresholds,
} from "@/lib/finances/inscription-financial-status";
import {
  type ChoreographyGroupType,
  computeDancerDiscountAmounts,
  type DancerDiscount,
  resolveEstimatedBasePriceAmount,
} from "@/lib/finances/operational-summary-calculations.server";

import type { Transaction } from "./choreography-cobro-support.server";

type Executor = Transaction | typeof db;

type RosterRow = {
  id: string;
  dancerId: string;
  selectedPriceId: string | null;
  groupType: string;
  choreographyScheduleId: string | null;
  scheduleCapacityScheduleId: string | null;
};

/**
 * Los umbrales de una inscripción más los insumos con los que se calcularon. El
 * precio y el descuento salen acompañando a los umbrales porque el cobro todavía
 * los persiste en las columnas congeladas, y tomarlos de otra cuenta sería
 * derivar lo mismo dos veces.
 */
export type InscriptionThresholdResolution = InscriptionThresholds & {
  dancerDiscountAmount: number;
  dancerDiscountPercentage: number;
  priceAmount: number | null;
};

/**
 * Los dos umbrales de un conjunto de inscripciones, resueltos con **la misma
 * regla que la lectura**: el precio manda (la fila seleccionada, y si no hay, la
 * vigente para el cronograma) y el `Descuento por bailarín` califica sobre el
 * roster vivo. Existe para que la escritura pueda computar lo adeudado sin
 * derivar un umbral por su cuenta: los dos caminos llaman a
 * `calculateDepositAmount` / `calculateTotalAmount`, que siguen siendo el único
 * dueño de la fórmula.
 *
 * Una inscripción sin precio resoluble sale con los dos umbrales en `null`, que
 * es lo que la lectura muestra como incompleto y lo que la escritura rechaza.
 */
export async function readInscriptionThresholds(
  executor: Executor,
  input: {
    academyId: string;
    eventId: string;
    inscriptionIds: string[];
  },
): Promise<Map<string, InscriptionThresholdResolution>> {
  const thresholds = new Map<string, InscriptionThresholdResolution>();
  const inscriptionIds = [...new Set(input.inscriptionIds)];

  if (inscriptionIds.length === 0) {
    return thresholds;
  }

  const event = await executor.query.events.findFirst({
    columns: { requiredDepositPercentage: true },
    where: eq(events.id, input.eventId),
  });

  if (!event) {
    return thresholds;
  }

  const targets = await executor
    .select({ dancerId: choreographyDancers.dancerId })
    .from(choreographyDancers)
    .where(inArray(choreographyDancers.id, inscriptionIds));
  const dancerIds = [...new Set(targets.map((row) => row.dancerId))];

  if (dancerIds.length === 0) {
    return thresholds;
  }

  const [priceRows, rosterRows] = await Promise.all([
    executor.query.prices.findMany({
      where: eq(prices.eventId, input.eventId),
    }),
    // El roster vivo del bailarín dentro del evento y la academia: es el
    // conjunto que decide cuántas inscripciones califican para el descuento, y
    // por eso no alcanza con las inscripciones pedidas.
    executor
      .select({
        id: choreographyDancers.id,
        dancerId: choreographyDancers.dancerId,
        selectedPriceId: choreographyDancers.selectedPriceId,
        groupType: choreographies.groupType,
        choreographyScheduleId: choreographies.scheduleId,
        scheduleCapacityScheduleId: scheduleCapacities.scheduleId,
      })
      .from(choreographyDancers)
      .innerJoin(
        choreographies,
        eq(choreographyDancers.choreographyId, choreographies.id),
      )
      .leftJoin(
        scheduleCapacities,
        eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
      )
      .where(
        and(
          eq(choreographies.academyId, input.academyId),
          eq(choreographies.eventId, input.eventId),
          inArray(choreographyDancers.dancerId, dancerIds),
        ),
      ),
  ]);

  const priceAmountByInscription = new Map<string, number | null>();
  for (const row of rosterRows) {
    priceAmountByInscription.set(
      row.id,
      resolveRosterPriceAmount({ priceRows, row }),
    );
  }

  const qualifyingByDancer = new Map<
    string,
    Array<{ id: string; priceAmount: number }>
  >();
  for (const row of rosterRows) {
    const priceAmount = priceAmountByInscription.get(row.id);

    if (priceAmount === null || priceAmount === undefined) {
      continue;
    }

    const bucket = qualifyingByDancer.get(row.dancerId);
    const entry = { id: row.id, priceAmount };

    if (bucket) {
      bucket.push(entry);
    } else {
      qualifyingByDancer.set(row.dancerId, [entry]);
    }
  }

  const discountByInscription = new Map<string, DancerDiscount>();
  for (const group of qualifyingByDancer.values()) {
    for (const [id, discount] of computeDancerDiscountAmounts(group)) {
      discountByInscription.set(id, discount);
    }
  }

  for (const inscriptionId of inscriptionIds) {
    const priceAmount = priceAmountByInscription.get(inscriptionId) ?? null;
    const discount = discountByInscription.get(inscriptionId) ?? {
      amount: 0,
      percentage: 0,
    };

    if (priceAmount === null) {
      thresholds.set(inscriptionId, {
        dancerDiscountAmount: 0,
        dancerDiscountPercentage: 0,
        depositAmount: null,
        priceAmount: null,
        totalAmount: null,
      });
      continue;
    }

    thresholds.set(inscriptionId, {
      dancerDiscountAmount: discount.amount,
      dancerDiscountPercentage: discount.percentage,
      depositAmount: calculateDepositAmount({
        priceAmount,
        requiredDepositPercentage: event.requiredDepositPercentage,
      }),
      priceAmount,
      totalAmount: calculateTotalAmount({
        dancerDiscountAmount: discount.amount,
        priceAmount,
      }),
    });
  }

  return thresholds;
}

/**
 * Precio de una inscripción: la fila seleccionada si la tiene, y si no la
 * vigente para su tipo de grupo y cronograma. Mismo orden que la lectura.
 */
function resolveRosterPriceAmount(input: {
  priceRows: (typeof prices.$inferSelect)[];
  row: RosterRow;
}): number | null {
  if (input.row.selectedPriceId !== null) {
    const selected = input.priceRows.find(
      (price) => price.id === input.row.selectedPriceId,
    );

    if (selected) {
      return selected.amount;
    }
  }

  const estimated = resolveEstimatedBasePriceAmount({
    choreography: {
      choreographyScheduleId: input.row.choreographyScheduleId,
      groupType: input.row.groupType as ChoreographyGroupType,
      scheduleCapacityScheduleId: input.row.scheduleCapacityScheduleId,
    },
    priceRows: input.priceRows,
  });

  return estimated.status === "missing-price" ? null : estimated.amount;
}
