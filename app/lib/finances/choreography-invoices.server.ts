import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
  academyEventInvoiceImputations,
  choreographies,
  eventFinancialSequences,
  prices,
  scheduleCapacities,
} from "@/db/schema";
import { selectApplicablePriceFromCandidates } from "@/lib/prices/repository.server";
import { balanceInvoiceInsertValues } from "./choreography-invoice-values.server";
import { validateInvoiceIssueDate } from "./choreography-invoice-validation.server";

export { calculateDepositAmount } from "./choreography-invoice-values.server";

type InvoiceValidationError = {
  message: string;
};

type BalanceInvoicePreview = {
  administrativeDiscountAmount: number;
  administrativeDiscountInternalReason: string | null;
  administrativeDiscountPublicLabel: string | null;
  appliedDepositAmount: number;
  balanceAmount: number;
  basePriceAmount: number;
  choreographyId: string;
  choreographyName: string;
  dancerDiscountAmount: number;
  depositCompletedOn: string;
  finalTotalAmount: number;
  issueDate: string;
  totalDiscountAmount: number;
};

type BalanceInvoiceValidationResult =
  | {
      ok: true;
      preview: BalanceInvoicePreview;
      requiredDepositPercentageSnapshot: number;
      selectedPriceId: string | null;
      selectedPaymentDeadline: string | null;
    }
  | ({
      ok: false;
      fieldErrors: {
        administrativeDiscountAmount?: string;
        administrativeDiscountInternalReason?: string;
        choreographyId?: string;
        issueDate?: string;
      };
    } & InvoiceValidationError);

export async function previewBalanceInvoice(input: {
  academyId: string;
  administrativeDiscountAmount: number;
  administrativeDiscountInternalReason: string | null;
  administrativeDiscountPublicLabel: string | null;
  choreographyId: string;
  eventId: string;
  issueDate: string;
}) {
  return await validateBalanceInvoiceInput(input);
}

export async function issueBalanceInvoice(input: {
  academyId: string;
  administrativeDiscountAmount: number;
  administrativeDiscountInternalReason: string | null;
  administrativeDiscountPublicLabel: string | null;
  choreographyId: string;
  createdByUserId: string;
  eventId: string;
  issueDate: string;
}) {
  const validated = await validateBalanceInvoiceInput(input);

  if (!validated.ok) {
    return validated;
  }

  await db.transaction(async (tx) => {
    const nextInvoiceNumber = await lockNextInvoiceNumber(tx, input.eventId);

    await tx.insert(academyEventChoreographyInvoices).values(
      balanceInvoiceInsertValues({
        academyId: input.academyId,
        choreographyId: input.choreographyId,
        createdByUserId: input.createdByUserId,
        eventId: input.eventId,
        invoiceNumber: nextInvoiceNumber,
        preview: validated.preview,
        requiredDepositPercentageSnapshot:
          validated.requiredDepositPercentageSnapshot,
        selectedPriceId: validated.selectedPriceId,
        selectedPaymentDeadline: validated.selectedPaymentDeadline,
      }),
    );

    await persistNextInvoiceNumber(tx, input.eventId, nextInvoiceNumber + 1);
  });

  return {
    ok: true as const,
  };
}

async function listActiveInvoiceChoreographyIds(
  choreographyIds: string[],
  invoiceType?: "saldo" | "sena",
) {
  if (choreographyIds.length === 0) {
    return new Set<string>();
  }

  const rows = await db
    .select({
      choreographyId: academyEventChoreographyInvoices.choreographyId,
    })
    .from(academyEventChoreographyInvoices)
    .where(
      and(
        inArray(
          academyEventChoreographyInvoices.choreographyId,
          choreographyIds,
        ),
        invoiceType
          ? eq(academyEventChoreographyInvoices.invoiceType, invoiceType)
          : undefined,
        isNull(academyEventChoreographyInvoices.cancelledAt),
      ),
    );

  return new Set(rows.map((row) => row.choreographyId));
}

export async function hasActiveInvoiceForChoreography(choreographyId: string) {
  const activeInvoiceIds = await listActiveInvoiceChoreographyIds([
    choreographyId,
  ]);

  return activeInvoiceIds.has(choreographyId);
}

// fallow-ignore-next-line complexity
async function validateBalanceInvoiceInput(input: {
  academyId: string;
  administrativeDiscountAmount: number;
  administrativeDiscountInternalReason: string | null;
  administrativeDiscountPublicLabel: string | null;
  choreographyId: string;
  eventId: string;
  issueDate: string;
}): Promise<BalanceInvoiceValidationResult> {
  const issueDateError = validateInvoiceIssueDate(input.issueDate);

  if (issueDateError) {
    return {
      ok: false,
      message: "Revisá los datos de la factura.",
      fieldErrors: {
        issueDate: issueDateError,
      },
    };
  }

  if (!input.choreographyId) {
    return {
      ok: false,
      message: "Revisá los datos de la factura.",
      fieldErrors: {
        choreographyId: "Seleccioná una Coreografía.",
      },
    };
  }

  if (
    !Number.isInteger(input.administrativeDiscountAmount) ||
    input.administrativeDiscountAmount < 0
  ) {
    return {
      ok: false,
      message: "Revisá los datos de la factura.",
      fieldErrors: {
        administrativeDiscountAmount:
          "Ingresá un descuento administrativo entero en pesos, sin centavos.",
      },
    };
  }

  if (
    input.administrativeDiscountAmount > 0 &&
    !input.administrativeDiscountInternalReason
  ) {
    return {
      ok: false,
      message: "Revisá los datos de la factura.",
      fieldErrors: {
        administrativeDiscountInternalReason:
          "Ingresá el motivo interno del descuento administrativo.",
      },
    };
  }

  const choreography = await db
    .select({
      createdAt: choreographies.createdAt,
      groupType: choreographies.groupType,
      id: choreographies.id,
      name: choreographies.name,
      scheduleId: scheduleCapacities.scheduleId,
    })
    .from(choreographies)
    .leftJoin(
      scheduleCapacities,
      eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
    )
    .where(
      and(
        eq(choreographies.id, input.choreographyId),
        eq(choreographies.academyId, input.academyId),
        eq(choreographies.eventId, input.eventId),
      ),
    )
    .then((rows) => rows[0]);

  if (!choreography) {
    return invalidBalanceChoreography();
  }

  const createdOn = choreography.createdAt.toISOString().slice(0, 10);

  if (input.issueDate < createdOn) {
    return {
      ok: false,
      message: "Revisá los datos de la factura.",
      fieldErrors: {
        issueDate:
          "La fecha de emisión no puede ser anterior a la creación de la Coreografía.",
      },
    };
  }

  const [depositInvoice, activeBalanceInvoiceIds] = await Promise.all([
    db.query.academyEventChoreographyInvoices.findFirst({
      where: and(
        eq(
          academyEventChoreographyInvoices.choreographyId,
          input.choreographyId,
        ),
        eq(academyEventChoreographyInvoices.invoiceType, "sena"),
        isNull(academyEventChoreographyInvoices.cancelledAt),
      ),
    }),
    listActiveInvoiceChoreographyIds([input.choreographyId], "saldo"),
  ]);

  if (!depositInvoice) {
    return balanceRequiresPaidDeposit();
  }

  if (activeBalanceInvoiceIds.has(input.choreographyId)) {
    return {
      ok: false,
      message: "Revisá los datos de la factura.",
      fieldErrors: {
        choreographyId:
          "Ya existe una factura de saldo activa para esta Coreografía.",
      },
    };
  }

  const depositImputedTotal = await db
    .select({
      amount:
        sql<number>`coalesce(sum(${academyEventInvoiceImputations.amount}), 0)`.mapWith(
          Number,
        ),
    })
    .from(academyEventInvoiceImputations)
    .where(
      and(
        eq(academyEventInvoiceImputations.invoiceId, depositInvoice.id),
        isNull(academyEventInvoiceImputations.annulledAt),
      ),
    )
    .then((rows) => Number(rows[0]?.amount ?? 0));

  if (
    depositInvoice.depositCompletedOn === null ||
    depositImputedTotal < depositInvoice.depositAmount
  ) {
    return balanceRequiresPaidDeposit();
  }
  const selectedPriceId = await resolveStoredInvoiceSelectedPriceId({
    basePriceAmount: depositInvoice.basePriceAmount,
    eventId: input.eventId,
    fallbackIssueDate: depositInvoice.issueDate,
    groupType: choreography.groupType,
    scheduleId: choreography.scheduleId,
    selectedPaymentDeadline: depositInvoice.selectedPaymentDeadline,
    selectedPriceId: depositInvoice.selectedPriceId,
  });

  const dancerDiscountAmount = 0;
  const totalDiscountAmount =
    dancerDiscountAmount + input.administrativeDiscountAmount;
  const finalTotalAmount = depositInvoice.basePriceAmount - totalDiscountAmount;
  const balanceAmount = finalTotalAmount - depositInvoice.depositAmount;

  if (balanceAmount < 0) {
    return {
      ok: false,
      message: "Revisá los datos de la factura.",
      fieldErrors: {
        administrativeDiscountAmount:
          "El descuento administrativo no puede dejar negativo el importe de saldo.",
      },
    };
  }

  return {
    ok: true,
    preview: {
      administrativeDiscountAmount: input.administrativeDiscountAmount,
      administrativeDiscountInternalReason:
        input.administrativeDiscountInternalReason,
      administrativeDiscountPublicLabel:
        input.administrativeDiscountPublicLabel,
      appliedDepositAmount: depositInvoice.depositAmount,
      balanceAmount,
      basePriceAmount: depositInvoice.basePriceAmount,
      choreographyId: choreography.id,
      choreographyName: choreography.name,
      dancerDiscountAmount,
      depositCompletedOn: depositInvoice.depositCompletedOn,
      finalTotalAmount,
      issueDate: input.issueDate,
      totalDiscountAmount,
    },
    requiredDepositPercentageSnapshot:
      depositInvoice.requiredDepositPercentageSnapshot,
    selectedPriceId,
    selectedPaymentDeadline: depositInvoice.selectedPaymentDeadline,
  };
}

async function resolveStoredInvoiceSelectedPriceId(input: {
  basePriceAmount: number;
  eventId: string;
  fallbackIssueDate: string;
  groupType: (typeof prices.$inferSelect)["groupType"];
  scheduleId: string | null;
  selectedPaymentDeadline: string | null;
  selectedPriceId: string | null;
}) {
  if (input.selectedPriceId) {
    return input.selectedPriceId;
  }

  const exactScopePrice = await resolveStoredInvoicePriceInScope({
    ...input,
    scheduleId: input.scheduleId,
  });

  if (exactScopePrice) {
    return exactScopePrice.id;
  }

  if (input.scheduleId === null) {
    return null;
  }

  return (
    (
      await resolveStoredInvoicePriceInScope({
        ...input,
        scheduleId: null,
      })
    )?.id ?? null
  );
}

async function resolveStoredInvoicePriceInScope(input: {
  basePriceAmount: number;
  eventId: string;
  fallbackIssueDate: string;
  groupType: (typeof prices.$inferSelect)["groupType"];
  scheduleId: string | null;
  selectedPaymentDeadline: string | null;
}) {
  const candidates = await db.query.prices.findMany({
    where: and(
      eq(prices.eventId, input.eventId),
      eq(prices.groupType, input.groupType),
      eq(prices.amount, input.basePriceAmount),
      input.selectedPaymentDeadline === null
        ? isNull(prices.paymentDeadline)
        : eq(prices.paymentDeadline, input.selectedPaymentDeadline),
      input.scheduleId === null
        ? isNull(prices.scheduleId)
        : eq(prices.scheduleId, input.scheduleId),
    ),
  });

  return selectApplicablePriceFromCandidates(
    candidates,
    input.fallbackIssueDate,
  );
}

function invalidBalanceChoreography(): BalanceInvoiceValidationResult {
  return {
    ok: false,
    message: "Revisá los datos de la factura.",
    fieldErrors: {
      choreographyId: "Revisá la Coreografía seleccionada.",
    },
  };
}

function balanceRequiresPaidDeposit(): BalanceInvoiceValidationResult {
  return {
    ok: false,
    message: "Revisá los datos de la factura.",
    fieldErrors: {
      choreographyId:
        "La factura de saldo solo puede emitirse cuando la seña activa está totalmente pagada.",
    },
  };
}

async function lockNextInvoiceNumber(
  tx: Parameters<typeof db.transaction>[0] extends (tx: infer T) => unknown
    ? T
    : never,
  eventId: string,
) {
  await tx
    .insert(eventFinancialSequences)
    .values({
      eventId,
    })
    .onConflictDoNothing();

  const [sequence] = await tx
    .select({
      nextInvoiceNumber: eventFinancialSequences.nextInvoiceNumber,
    })
    .from(eventFinancialSequences)
    .where(eq(eventFinancialSequences.eventId, eventId))
    .for("update");

  if (!sequence) {
    throw new Error("Expected event financial sequence to exist.");
  }

  return sequence.nextInvoiceNumber;
}

async function persistNextInvoiceNumber(
  tx: Parameters<typeof db.transaction>[0] extends (tx: infer T) => unknown
    ? T
    : never,
  eventId: string,
  nextInvoiceNumber: number,
) {
  await tx
    .update(eventFinancialSequences)
    .set({
      nextInvoiceNumber,
      updatedAt: new Date(),
    })
    .where(eq(eventFinancialSequences.eventId, eventId));
}
