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
  buildChoreographyOperationalFinanceRow,
  buildOperationalFinanceSummaryFromChoreographyRows,
  calculateDepositAmount,
  type ChoreographyGroupType,
  type ChoreographyOperationalFinanceRow,
  computeDancerDiscountAmounts,
  type DancerDiscount,
  deriveInscriptionFinancialState,
  type FinanceChoreographyRow,
  type ResolvedInscription,
  resolveEstimatedBasePriceAmount,
} from "@/lib/finances/operational-summary-calculations.server";

type FinancePriceRow = typeof prices.$inferSelect;

type InscriptionRow = {
  id: string;
  choreographyId: string;
  dancerId: string;
  frozenBasePriceAmount: number | null;
  depositAmount: number | null;
  depositReferenceDate: string | null;
  balanceReferenceDate: string | null;
  appliedDancerDiscountAmount: number | null;
  finalTotalAmount: number | null;
  balanceAmount: number | null;
};

export type AcademyEventOperationalFinanceDetail = {
  choreographyFinanceRows: ChoreographyOperationalFinanceRow[];
  inscriptions: ResolvedInscription[];
  summary: OperationalFinanceSummary;
};

export async function readAcademyEventOperationalFinanceSummary(input: {
  academyId: string;
  eventId: string;
}): Promise<OperationalFinanceSummary> {
  const summaries = await readAcademyEventOperationalFinanceSummaries({
    academyIds: [input.academyId],
    eventId: input.eventId,
  });

  return summaries.get(input.academyId) ?? emptyOperationalFinanceSummary();
}

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
            frozenBasePriceAmount: choreographyDancers.frozenBasePriceAmount,
            depositAmount: choreographyDancers.depositAmount,
            depositReferenceDate: choreographyDancers.depositReferenceDate,
            balanceReferenceDate: choreographyDancers.balanceReferenceDate,
            appliedDancerDiscountAmount:
              choreographyDancers.appliedDancerDiscountAmount,
            finalTotalAmount: choreographyDancers.finalTotalAmount,
            balanceAmount: choreographyDancers.balanceAmount,
          })
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

  const inscriptionState = new Map<
    string,
    ReturnType<typeof deriveInscriptionFinancialState>
  >();
  for (const inscription of inscriptionRows) {
    inscriptionState.set(
      inscription.id,
      deriveInscriptionFinancialState(inscription),
    );
  }

  const dancerDiscounts = buildDancerDiscounts({
    inscriptionRows,
    inscriptionState,
  });

  const inscriptions: ResolvedInscription[] = inscriptionRows.map(
    (inscription) => {
      const state = inscriptionState.get(inscription.id) ?? "impaga";
      const choreography = choreographyById.get(inscription.choreographyId);

      return resolveInscription({
        allocatedAmount: allocationByInscription.get(inscription.id) ?? 0,
        choreography,
        dancerDiscounts,
        inscription,
        priceRows,
        requiredDepositPercentage: event.requiredDepositPercentage,
        state,
      });
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

function buildDancerDiscounts(input: {
  inscriptionRows: InscriptionRow[];
  inscriptionState: Map<
    string,
    ReturnType<typeof deriveInscriptionFinancialState>
  >;
}): Map<string, DancerDiscount> {
  const qualifyingByDancer = new Map<
    string,
    Array<{ id: string; frozenBasePriceAmount: number }>
  >();

  for (const inscription of input.inscriptionRows) {
    const state = input.inscriptionState.get(inscription.id);

    if (
      (state !== "señada" && state !== "pagada") ||
      inscription.frozenBasePriceAmount === null
    ) {
      continue;
    }

    const bucket = qualifyingByDancer.get(inscription.dancerId);
    const entry = {
      frozenBasePriceAmount: inscription.frozenBasePriceAmount,
      id: inscription.id,
    };

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

function resolveInscription(input: {
  allocatedAmount: number;
  choreography: FinanceChoreographyRow | undefined;
  dancerDiscounts: Map<string, DancerDiscount>;
  inscription: InscriptionRow;
  priceRows: FinancePriceRow[];
  requiredDepositPercentage: number;
  state: ReturnType<typeof deriveInscriptionFinancialState>;
}): ResolvedInscription {
  const base = {
    id: input.inscription.id,
    choreographyId: input.inscription.choreographyId,
    dancerId: input.inscription.dancerId,
    state: input.state,
    paidAmount: input.allocatedAmount,
    depositReferenceDate: input.inscription.depositReferenceDate,
  } as const;

  if (input.state === "impaga") {
    const estimated = input.choreography
      ? resolveEstimatedBasePriceAmount({
          choreography: input.choreography,
          priceRows: input.priceRows,
        })
      : ({ status: "missing-price" } as const);

    if (estimated.status === "missing-price") {
      return {
        ...base,
        basePriceAmount: null,
        depositAmount: null,
        balancePendingAmount: 0,
        dancerDiscountAmount: 0,
        finalPriceAmount: null,
      };
    }

    return {
      ...base,
      basePriceAmount: estimated.amount,
      depositAmount: calculateDepositAmount({
        amount: estimated.amount,
        percentage: input.requiredDepositPercentage,
      }),
      balancePendingAmount: 0,
      dancerDiscountAmount: 0,
      finalPriceAmount: estimated.amount,
    };
  }

  const frozenBasePriceAmount = input.inscription.frozenBasePriceAmount ?? 0;
  const depositAmount = input.inscription.depositAmount ?? 0;

  if (input.state === "señada") {
    const discount =
      input.dancerDiscounts.get(input.inscription.id)?.amount ?? 0;

    return {
      ...base,
      basePriceAmount: frozenBasePriceAmount,
      depositAmount,
      balancePendingAmount: Math.max(
        0,
        frozenBasePriceAmount - depositAmount - discount,
      ),
      dancerDiscountAmount: discount,
      finalPriceAmount: frozenBasePriceAmount - discount,
    };
  }

  const frozenDiscount = input.inscription.appliedDancerDiscountAmount ?? 0;

  return {
    ...base,
    basePriceAmount: frozenBasePriceAmount,
    depositAmount,
    balancePendingAmount: 0,
    dancerDiscountAmount: frozenDiscount,
    finalPriceAmount:
      input.inscription.finalTotalAmount ??
      frozenBasePriceAmount - frozenDiscount,
  };
}
