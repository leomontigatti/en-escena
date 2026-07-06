import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
  academyEventInvoiceImputations,
  choreographies,
  eventFinancialSequences,
  events,
  scheduleCapacities,
} from "@/db/schema";
import { resolveApplicablePrice } from "@/lib/prices/repository.server";
import { isDateOnly, isFutureDateOnly } from "@/lib/shared/date-only";

type InvoiceValidationError = {
  message: string;
};

type DepositInvoiceValidationResult =
  | {
      ok: true;
      choreographies: Array<{
        id: string;
        name: string;
        basePriceAmount: number;
        createdOn: string;
        selectedPaymentDeadline: string | null;
      }>;
      event: {
        id: string;
        requiredDepositPercentage: number;
      };
    }
  | ({
      ok: false;
      fieldErrors: {
        choreographyIds?: string;
        issueDate?: string;
      };
    } & InvoiceValidationError);

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

export async function issueDepositInvoices(input: {
  academyId: string;
  choreographyIds: string[];
  createdByUserId: string;
  eventId: string;
  issueDate: string;
}) {
  const validated = await validateDepositInvoiceInput(input);

  if (!validated.ok) {
    return validated;
  }

  const { choreographies: eligibleChoreographies, event } = validated;
  const requiredDepositPercentage = event.requiredDepositPercentage;

  await db.transaction(async (tx) => {
    const nextInvoiceNumber = await lockNextInvoiceNumber(tx, input.eventId);
    let invoiceNumber = nextInvoiceNumber;

    await tx.insert(academyEventChoreographyInvoices).values(
      eligibleChoreographies.map((choreography) => {
        const depositAmount = calculateDepositAmount({
          amount: choreography.basePriceAmount,
          percentage: requiredDepositPercentage,
        });

        return {
          academyId: input.academyId,
          basePriceAmount: choreography.basePriceAmount,
          choreographyId: choreography.id,
          createdByUserId: input.createdByUserId,
          depositAmount,
          eventId: input.eventId,
          invoiceNumber: invoiceNumber++,
          invoiceType: "sena" as const,
          issueDate: input.issueDate,
          requiredDepositPercentageSnapshot: requiredDepositPercentage,
          selectedPaymentDeadline: choreography.selectedPaymentDeadline,
        };
      }),
    );

    await persistNextInvoiceNumber(tx, input.eventId, invoiceNumber);
  });

  return {
    ok: true as const,
  };
}

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

    await tx.insert(academyEventChoreographyInvoices).values({
      academyId: input.academyId,
      appliedDepositAmount: validated.preview.appliedDepositAmount,
      administrativeDiscountAmount:
        validated.preview.administrativeDiscountAmount,
      administrativeDiscountInternalReason:
        validated.preview.administrativeDiscountInternalReason,
      administrativeDiscountPublicLabel:
        validated.preview.administrativeDiscountPublicLabel,
      basePriceAmount: validated.preview.basePriceAmount,
      choreographyId: input.choreographyId,
      createdByUserId: input.createdByUserId,
      dancerDiscountAmount: validated.preview.dancerDiscountAmount,
      depositAmount: validated.preview.balanceAmount,
      depositCompletedOn: validated.preview.depositCompletedOn,
      eventId: input.eventId,
      finalTotalAmount: validated.preview.finalTotalAmount,
      invoiceNumber: nextInvoiceNumber,
      invoiceType: "saldo",
      issueDate: input.issueDate,
      requiredDepositPercentageSnapshot:
        validated.requiredDepositPercentageSnapshot,
      selectedPaymentDeadline: validated.selectedPaymentDeadline,
      totalDiscountAmount: validated.preview.totalDiscountAmount,
    });

    await persistNextInvoiceNumber(tx, input.eventId, nextInvoiceNumber + 1);
  });

  return {
    ok: true as const,
  };
}

export async function listActiveInvoiceChoreographyIds(
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
async function validateDepositInvoiceInput(input: {
  academyId: string;
  choreographyIds: string[];
  eventId: string;
  issueDate: string;
}): Promise<DepositInvoiceValidationResult> {
  const choreographyIds = [...new Set(input.choreographyIds)];
  const issueDateError = validateIssueDate(input.issueDate);

  if (choreographyIds.length === 0) {
    return {
      ok: false,
      message: "Seleccioná al menos una Coreografía.",
      fieldErrors: {
        choreographyIds: "Seleccioná al menos una Coreografía.",
      },
    };
  }

  if (issueDateError) {
    return {
      ok: false,
      message: "Revisá los datos de la factura.",
      fieldErrors: {
        issueDate: issueDateError,
      },
    };
  }

  const event = await db.query.events.findFirst({
    columns: {
      id: true,
      requiredDepositPercentage: true,
    },
    where: eq(events.id, input.eventId),
  });

  if (!event) {
    throw new Error("Expected event to exist for deposit invoice issuance.");
  }

  const choreographyRows = await db
    .select({
      id: choreographies.id,
      name: choreographies.name,
      createdAt: choreographies.createdAt,
      groupType: choreographies.groupType,
      scheduleId: scheduleCapacities.scheduleId,
    })
    .from(choreographies)
    .leftJoin(
      scheduleCapacities,
      eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
    )
    .where(
      and(
        eq(choreographies.academyId, input.academyId),
        eq(choreographies.eventId, input.eventId),
        inArray(choreographies.id, choreographyIds),
      ),
    );

  if (choreographyRows.length !== choreographyIds.length) {
    return invalidChoreographySelection();
  }

  const latestCreatedOn = choreographyRows.reduce<string | null>(
    (latest, choreography) => {
      const createdOn = choreography.createdAt.toISOString().slice(0, 10);
      return latest === null || createdOn > latest ? createdOn : latest;
    },
    null,
  );

  if (latestCreatedOn && input.issueDate < latestCreatedOn) {
    return {
      ok: false,
      message: "Revisá los datos de la factura.",
      fieldErrors: {
        issueDate:
          "La fecha de emisión no puede ser anterior a la creación de la Coreografía más reciente seleccionada.",
      },
    };
  }

  const activeInvoiceIds = await listActiveInvoiceChoreographyIds(
    choreographyIds,
    "sena",
  );

  if (activeInvoiceIds.size > 0) {
    return {
      ok: false,
      message:
        "Ya existe una factura de seña activa para alguna de las Coreografías seleccionadas.",
      fieldErrors: {
        choreographyIds:
          "Ya existe una factura de seña activa para alguna de las Coreografías seleccionadas.",
      },
    };
  }

  const resolvedChoreographies = await Promise.all(
    choreographyRows.map(async (choreography) => {
      const priceResult = await resolveApplicablePrice({
        eventId: input.eventId,
        groupType: choreography.groupType,
        paymentDate: input.issueDate,
        scheduleId: choreography.scheduleId,
      });

      if (!priceResult.ok) {
        throw new Error(
          `No applicable price found for choreography ${choreography.id}.`,
        );
      }

      return {
        basePriceAmount: priceResult.price.amount,
        createdOn: choreography.createdAt.toISOString().slice(0, 10),
        id: choreography.id,
        name: choreography.name,
        selectedPaymentDeadline: priceResult.price.paymentDeadline,
      };
    }),
  );

  return {
    ok: true,
    choreographies: resolvedChoreographies,
    event: {
      id: event.id,
      requiredDepositPercentage: event.requiredDepositPercentage,
    },
  };
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
  const issueDateError = validateIssueDate(input.issueDate);

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

  const [depositImputedTotal, priceResult] = await Promise.all([
    db
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
      .then((rows) => Number(rows[0]?.amount ?? 0)),
    resolveApplicablePrice({
      eventId: input.eventId,
      groupType: choreography.groupType,
      paymentDate: depositInvoice.depositCompletedOn ?? input.issueDate,
      scheduleId: choreography.scheduleId,
    }),
  ]);

  if (
    depositInvoice.depositCompletedOn === null ||
    depositImputedTotal < depositInvoice.depositAmount
  ) {
    return balanceRequiresPaidDeposit();
  }

  if (!priceResult.ok) {
    throw new Error(
      `No applicable price found for choreography ${input.choreographyId}.`,
    );
  }

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
    selectedPaymentDeadline: priceResult.price.paymentDeadline,
  };
}

function invalidChoreographySelection(): DepositInvoiceValidationResult {
  return {
    ok: false,
    message: "No pudimos resolver las Coreografías seleccionadas.",
    fieldErrors: {
      choreographyIds: "Revisá las Coreografías seleccionadas.",
    },
  };
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

function validateIssueDate(issueDate: string) {
  if (!issueDate) {
    return "Ingresá la fecha de emisión.";
  }

  if (!isDateOnly(issueDate)) {
    return "Ingresá una fecha válida.";
  }

  if (isFutureDateOnly(issueDate)) {
    return "La fecha de emisión no puede ser futura.";
  }

  return null;
}

export function calculateDepositAmount(input: {
  amount: number;
  percentage: number;
}) {
  return Math.round((input.amount * input.percentage) / 100);
}
