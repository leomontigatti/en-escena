import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  payments,
  choreographyDancers,
  choreographies,
  events,
  paymentAllocations,
  prices,
  scheduleCapacities,
} from "@/db/schema";
import {
  emptyOperationalFinanceSummary,
  type OperationalFinanceSummary,
} from "@/lib/finances/operational-summary";
import {
  calculateDepositAmount,
  calculateTotalAmount,
  deriveInscriptionFinancialFigures,
} from "@/lib/finances/inscription-financial-status";
import {
  buildChoreographyOperationalFinanceRow,
  buildOperationalFinanceSummaryFromChoreographyRows,
  type ChoreographyGroupType,
  type ChoreographyOperationalFinanceRow,
  computeDancerDiscountAmounts,
  type DancerDiscount,
  type FinanceChoreographyRow,
  type ResolvedInscription,
  resolveEffectiveBasePriceAmount,
} from "@/lib/finances/operational-summary-calculations.server";

type InscriptionRow = {
  id: string;
  choreographyId: string;
  dancerId: string;
  selectedPriceId: string | null;
  withdrawnAt: Date | null;
};

export type AcademyEventOperationalFinanceDetail = {
  choreographyFinanceRows: ChoreographyOperationalFinanceRow[];
  inscriptions: ResolvedInscription[];
  summary: OperationalFinanceSummary;
};

export async function readAcademyEventOperationalFinanceSummaries(input: {
  academyIds: string[];
  eventId: string;
}): Promise<Map<string, OperationalFinanceSummary>> {
  const academyIds = [...new Set(input.academyIds)];
  const summaries = new Map<string, OperationalFinanceSummary>();

  for (const academyId of academyIds) {
    summaries.set(academyId, emptyOperationalFinanceSummary());
  }

  if (academyIds.length === 0) {
    return summaries;
  }

  const finance = await readAcademyEventFinance({
    academyIds,
    eventId: input.eventId,
  });

  for (const academyId of academyIds) {
    const academyRows = finance.choreographyFinanceRowsByAcademy.get(academyId);

    summaries.set(
      academyId,
      buildOperationalFinanceSummaryFromChoreographyRows({
        availableBalanceAmount:
          (finance.paidByAcademy.get(academyId) ?? 0) -
          (finance.allocatedByAcademy.get(academyId) ?? 0),
        choreographyFinanceRows: academyRows ?? [],
        totalPaidAmount: finance.paidByAcademy.get(academyId) ?? 0,
      }),
    );
  }

  return summaries;
}

export async function readAcademyEventOperationalFinanceDetail(input: {
  academyId: string;
  eventId: string;
}): Promise<AcademyEventOperationalFinanceDetail> {
  const finance = await readAcademyEventFinance({
    academyIds: [input.academyId],
    eventId: input.eventId,
  });
  const totalPaidAmount = finance.paidByAcademy.get(input.academyId) ?? 0;
  const availableBalanceAmount =
    totalPaidAmount - (finance.allocatedByAcademy.get(input.academyId) ?? 0);
  const choreographyFinanceRows =
    finance.choreographyFinanceRowsByAcademy.get(input.academyId) ?? [];

  return {
    choreographyFinanceRows,
    inscriptions: finance.inscriptions.filter(
      (inscription) =>
        finance.choreographyAcademyById.get(inscription.choreographyId) ===
        input.academyId,
    ),
    summary: buildOperationalFinanceSummaryFromChoreographyRows({
      availableBalanceAmount,
      choreographyFinanceRows,
      totalPaidAmount,
    }),
  };
}

type AcademyEventFinance = {
  allocatedByAcademy: Map<string, number>;
  choreographyAcademyById: Map<string, string>;
  choreographyFinanceRowsByAcademy: Map<
    string,
    ChoreographyOperationalFinanceRow[]
  >;
  inscriptions: ResolvedInscription[];
  paidByAcademy: Map<string, number>;
};

async function readAcademyEventFinance(input: {
  academyIds: string[];
  eventId: string;
}): Promise<AcademyEventFinance> {
  const [event, choreographyRows, priceRows] = await Promise.all([
    db.query.events.findFirst({
      columns: { requiredDepositPercentage: true },
      where: eq(events.id, input.eventId),
    }),
    db
      .select({
        academyId: choreographies.academyId,
        choreographyScheduleId: choreographies.scheduleId,
        groupType: choreographies.groupType,
        id: choreographies.id,
        name: choreographies.name,
        scheduleCapacityScheduleId: scheduleCapacities.scheduleId,
      })
      .from(choreographies)
      .leftJoin(
        scheduleCapacities,
        eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
      )
      .where(
        and(
          eq(choreographies.eventId, input.eventId),
          inArray(choreographies.academyId, input.academyIds),
        ),
      )
      .orderBy(asc(choreographies.name), asc(choreographies.createdAt)),
    db.query.prices.findMany({
      where: eq(prices.eventId, input.eventId),
    }),
  ]);

  if (!event) {
    throw new Error("Expected event to exist for finance summary.");
  }

  const choreographyById = new Map(
    choreographyRows.map((row) => [
      row.id,
      {
        academyId: row.academyId,
        choreographyScheduleId: row.choreographyScheduleId,
        groupType: row.groupType as ChoreographyGroupType,
        id: row.id,
        name: row.name,
        scheduleCapacityScheduleId: row.scheduleCapacityScheduleId,
      } satisfies FinanceChoreographyRow,
    ]),
  );
  const choreographyAcademyById = new Map(
    choreographyRows.map((row) => [row.id, row.academyId]),
  );

  const [inscriptionRows, allocationRows, paymentRows] = await Promise.all([
    choreographyRows.length === 0
      ? Promise.resolve<InscriptionRow[]>([])
      : db
          .select({
            id: choreographyDancers.id,
            choreographyId: choreographyDancers.choreographyId,
            dancerId: choreographyDancers.dancerId,
            selectedPriceId: choreographyDancers.selectedPriceId,
            withdrawnAt: choreographyDancers.withdrawnAt,
          })
          // No `activeInscription()` here, and not because of a display
          // exception: this is the shared money rollup behind every finance
          // surface, admin and portal, list and detail alike, and a withdrawn
          // row's retained money is still the choreography's.
          // Dropping it here would take that money out of every rollup built on
          // top. What withdrawal changes is how the row's figures are derived
          // and which rollups it feeds, not whether it is read; each surface
          // decides on its own whether to display it.
          .from(choreographyDancers)
          .where(
            inArray(
              choreographyDancers.choreographyId,
              choreographyRows.map((row) => row.id),
            ),
          ),
    db
      .select({
        academyId: paymentAllocations.academyId,
        inscriptionId: paymentAllocations.inscriptionId,
        amount: paymentAllocations.amount,
      })
      .from(paymentAllocations)
      .where(
        and(
          eq(paymentAllocations.eventId, input.eventId),
          inArray(paymentAllocations.academyId, input.academyIds),
        ),
      ),
    db.query.payments.findMany({
      columns: { academyId: true, amount: true },
      where: and(
        eq(payments.eventId, input.eventId),
        inArray(payments.academyId, input.academyIds),
      ),
    }),
  ]);

  const allocationByInscription = new Map<string, number>();
  const allocatedByAcademy = new Map<string, number>();

  for (const allocation of allocationRows) {
    allocationByInscription.set(
      allocation.inscriptionId,
      (allocationByInscription.get(allocation.inscriptionId) ?? 0) +
        allocation.amount,
    );
    allocatedByAcademy.set(
      allocation.academyId,
      (allocatedByAcademy.get(allocation.academyId) ?? 0) + allocation.amount,
    );
  }

  const paidByAcademy = new Map<string, number>();

  for (const payment of paymentRows) {
    paidByAcademy.set(
      payment.academyId,
      (paidByAcademy.get(payment.academyId) ?? 0) + payment.amount,
    );
  }

  // El precio manda: la seña sale de él sin descontar, el descuento vivo sale
  // de él, y el total es su resta. Ninguna de las tres mira un snapshot.
  //
  // Which price that is depends on the money already on the row, so this has to
  // run after the allocations are summed: the stored row governs only once the
  // inscription has crossed its deposit threshold.
  const priceAmountByInscription = new Map<string, number | null>();
  for (const inscription of inscriptionRows) {
    priceAmountByInscription.set(
      inscription.id,
      resolveEffectiveBasePriceAmount({
        allocatedAmount: allocationByInscription.get(inscription.id) ?? 0,
        choreography: choreographyById.get(inscription.choreographyId),
        priceRows,
        requiredDepositPercentage: event.requiredDepositPercentage,
        selectedPriceId: inscription.selectedPriceId,
      }),
    );
  }

  const dancerDiscounts = buildDancerDiscounts({
    inscriptionRows,
    priceAmountByInscription,
  });

  const inscriptions: ResolvedInscription[] = inscriptionRows.map(
    (inscription) => {
      const priceAmount = priceAmountByInscription.get(inscription.id) ?? null;
      const dancerDiscountAmount =
        dancerDiscounts.get(inscription.id)?.amount ?? 0;
      const withdrawn = inscription.withdrawnAt !== null;
      const figures = deriveInscriptionFinancialFigures({
        allocatedAmount: allocationByInscription.get(inscription.id) ?? 0,
        withdrawn,
        thresholds: {
          depositAmount:
            priceAmount === null
              ? null
              : calculateDepositAmount({
                  priceAmount,
                  requiredDepositPercentage: event.requiredDepositPercentage,
                }),
          totalAmount:
            priceAmount === null
              ? null
              : calculateTotalAmount({ dancerDiscountAmount, priceAmount }),
        },
      });

      return {
        ...figures,
        basePriceAmount: priceAmount,
        choreographyId: inscription.choreographyId,
        dancerDiscountAmount,
        dancerId: inscription.dancerId,
        id: inscription.id,
        withdrawn,
      };
    },
  );

  const inscriptionsByChoreography = new Map<string, ResolvedInscription[]>();
  for (const inscription of inscriptions) {
    const bucket = inscriptionsByChoreography.get(inscription.choreographyId);
    if (bucket) {
      bucket.push(inscription);
    } else {
      inscriptionsByChoreography.set(inscription.choreographyId, [inscription]);
    }
  }

  const choreographyFinanceRowsByAcademy = new Map<
    string,
    ChoreographyOperationalFinanceRow[]
  >();
  for (const academyId of input.academyIds) {
    choreographyFinanceRowsByAcademy.set(academyId, []);
  }
  for (const choreography of choreographyRows) {
    const row = buildChoreographyOperationalFinanceRow({
      choreography: choreographyById.get(choreography.id)!,
      inscriptions: inscriptionsByChoreography.get(choreography.id) ?? [],
    });
    choreographyFinanceRowsByAcademy.get(choreography.academyId)?.push(row);
  }

  return {
    allocatedByAcademy,
    choreographyAcademyById,
    choreographyFinanceRowsByAcademy,
    inscriptions,
    paidByAcademy,
  };
}

/**
 * El `Descuento por bailarín` califica sobre el **roster vivo**: toda
 * inscripción del bailarín con precio resoluble cuenta. No puede depender del
 * estado financiero, que se deriva del total, que ya contiene este descuento.
 *
 * Live roster means without the withdrawn ones: an inscription that was taken
 * off the roster cannot keep making its siblings cheaper.
 */
function buildDancerDiscounts(input: {
  inscriptionRows: InscriptionRow[];
  priceAmountByInscription: Map<string, number | null>;
}): Map<string, DancerDiscount> {
  const qualifyingByDancer = new Map<
    string,
    Array<{ id: string; priceAmount: number }>
  >();

  for (const inscription of input.inscriptionRows) {
    const priceAmount = input.priceAmountByInscription.get(inscription.id);

    if (
      inscription.withdrawnAt !== null ||
      priceAmount === null ||
      priceAmount === undefined
    ) {
      continue;
    }

    const bucket = qualifyingByDancer.get(inscription.dancerId);
    const entry = { id: inscription.id, priceAmount };

    if (bucket) {
      bucket.push(entry);
    } else {
      qualifyingByDancer.set(inscription.dancerId, [entry]);
    }
  }

  const discounts = new Map<string, DancerDiscount>();
  for (const group of qualifyingByDancer.values()) {
    for (const [id, discount] of computeDancerDiscountAmounts(group)) {
      discounts.set(id, discount);
    }
  }

  return discounts;
}
