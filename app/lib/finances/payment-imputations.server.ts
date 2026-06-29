import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
  academyEventInvoiceImputations,
  academyEventPayments,
  choreographies,
  scheduleCapacities,
} from "@/db/schema";
import { resolveApplicablePrice } from "@/lib/events/bases-repository.server";
import { isDateOnly, isFutureDateOnly } from "@/lib/shared/date-only";

type InvoiceState = "pendiente" | "parcial" | "pagada";
export type ChoreographyFinancialState = "impaga" | "señada" | "pagada";

type CreatePaymentImputationResult =
  | { ok: true }
  | {
      ok: false;
      fieldErrors: {
        amount?: string;
        imputationDate?: string;
        invoiceId?: string;
        paymentId?: string;
      };
      message: string;
    };

type ValidatedPaymentImputationInput = {
  ok: true;
  invoice: {
    choreographyId: string;
    depositAmount: number;
    id: string;
  };
  invoiceImputedAmount: number;
  payment: {
    id: string;
  };
};

type ActiveImputationTotalsById = {
  invoiceTotals: Map<string, number>;
  paymentTotals: Map<string, number>;
};

export async function createPaymentImputation(input: {
  academyId: string;
  amount: number;
  createdByUserId: string;
  eventId: string;
  imputationDate: string;
  invoiceId: string;
  paymentId: string;
}): Promise<CreatePaymentImputationResult> {
  const validated = await validatePaymentImputationInput(input);

  if (!validated.ok) {
    return validated;
  }

  await db.transaction(async (tx) => {
    await tx.insert(academyEventInvoiceImputations).values({
      academyId: input.academyId,
      amount: input.amount,
      createdByUserId: input.createdByUserId,
      eventId: input.eventId,
      imputationDate: input.imputationDate,
      invoiceId: validated.invoice.id,
      paymentId: validated.payment.id,
    });

    const nextInvoiceState = getInvoiceState({
      amount: validated.invoice.depositAmount,
      imputedAmount: validated.invoiceImputedAmount + input.amount,
    });

    await tx
      .update(academyEventChoreographyInvoices)
      .set({
        depositCompletedOn:
          nextInvoiceState === "pagada" ? input.imputationDate : null,
        updatedAt: new Date(),
      })
      .where(eq(academyEventChoreographyInvoices.id, validated.invoice.id));
  });

  return { ok: true };
}

export async function listActiveImputationTotalsByIds(input: {
  invoiceIds: string[];
  paymentIds: string[];
}) {
  const conditions = [];

  if (input.invoiceIds.length > 0) {
    conditions.push(
      inArray(academyEventInvoiceImputations.invoiceId, input.invoiceIds),
    );
  }

  if (input.paymentIds.length > 0) {
    conditions.push(
      inArray(academyEventInvoiceImputations.paymentId, input.paymentIds),
    );
  }

  if (conditions.length === 0) {
    return {
      invoiceTotals: new Map<string, number>(),
      paymentTotals: new Map<string, number>(),
    } satisfies ActiveImputationTotalsById;
  }

  const rows = await db
    .select({
      invoiceId: academyEventInvoiceImputations.invoiceId,
      paymentId: academyEventInvoiceImputations.paymentId,
      amount: academyEventInvoiceImputations.amount,
    })
    .from(academyEventInvoiceImputations)
    .where(
      and(isNull(academyEventInvoiceImputations.annulledAt), ...conditions),
    );

  const invoiceTotals = new Map<string, number>();
  const paymentTotals = new Map<string, number>();

  for (const row of rows) {
    invoiceTotals.set(
      row.invoiceId,
      (invoiceTotals.get(row.invoiceId) ?? 0) + row.amount,
    );
    paymentTotals.set(
      row.paymentId,
      (paymentTotals.get(row.paymentId) ?? 0) + row.amount,
    );
  }

  return {
    invoiceTotals,
    paymentTotals,
  } satisfies ActiveImputationTotalsById;
}

export async function listActiveImputationsForAcademyEvent(input: {
  academyId: string;
  eventId: string;
}) {
  return await db
    .select({
      amount: academyEventInvoiceImputations.amount,
      id: academyEventInvoiceImputations.id,
      imputationDate: academyEventInvoiceImputations.imputationDate,
      invoiceNumber: academyEventChoreographyInvoices.invoiceNumber,
      paymentNumber: academyEventPayments.paymentNumber,
      choreographyName: choreographies.name,
    })
    .from(academyEventInvoiceImputations)
    .innerJoin(
      academyEventPayments,
      eq(academyEventInvoiceImputations.paymentId, academyEventPayments.id),
    )
    .innerJoin(
      academyEventChoreographyInvoices,
      eq(
        academyEventInvoiceImputations.invoiceId,
        academyEventChoreographyInvoices.id,
      ),
    )
    .innerJoin(
      choreographies,
      eq(academyEventChoreographyInvoices.choreographyId, choreographies.id),
    )
    .where(
      and(
        eq(academyEventInvoiceImputations.academyId, input.academyId),
        eq(academyEventInvoiceImputations.eventId, input.eventId),
        isNull(academyEventInvoiceImputations.annulledAt),
      ),
    )
    .orderBy(
      sql`${academyEventInvoiceImputations.imputationDate} desc`,
      sql`${academyEventInvoiceImputations.createdAt} desc`,
    );
}

export async function deriveChoreographyFinancialStates(
  choreographyIds: string[],
): Promise<Map<string, ChoreographyFinancialState>> {
  if (choreographyIds.length === 0) {
    return new Map<string, ChoreographyFinancialState>();
  }

  const invoiceRows = await db
    .select({
      choreographyId: academyEventChoreographyInvoices.choreographyId,
      depositAmount: academyEventChoreographyInvoices.depositAmount,
      id: academyEventChoreographyInvoices.id,
      invoiceType: academyEventChoreographyInvoices.invoiceType,
    })
    .from(academyEventChoreographyInvoices)
    .where(
      and(
        inArray(
          academyEventChoreographyInvoices.choreographyId,
          choreographyIds,
        ),
        isNull(academyEventChoreographyInvoices.cancelledAt),
      ),
    );

  const totals = await listActiveImputationTotalsByIds({
    invoiceIds: invoiceRows.map((row) => row.id),
    paymentIds: [],
  });

  const states = new Map<string, ChoreographyFinancialState>();

  for (const choreographyId of choreographyIds) {
    states.set(choreographyId, "impaga");
  }

  for (const invoice of invoiceRows) {
    const imputedAmount = totals.invoiceTotals.get(invoice.id) ?? 0;
    const isPaid = imputedAmount >= invoice.depositAmount;

    if (invoice.invoiceType === "saldo" && isPaid) {
      states.set(invoice.choreographyId, "pagada");
      continue;
    }

    if (invoice.invoiceType === "sena" && isPaid) {
      if (states.get(invoice.choreographyId) !== "pagada") {
        states.set(invoice.choreographyId, "señada");
      }
    }
  }

  return states;
}

export function getInvoiceState(input: {
  amount: number;
  imputedAmount: number;
}): InvoiceState {
  if (input.imputedAmount <= 0) {
    return "pendiente";
  }

  if (input.imputedAmount >= input.amount) {
    return "pagada";
  }

  return "parcial";
}

// fallow-ignore-next-line complexity
async function validatePaymentImputationInput(input: {
  academyId: string;
  amount: number;
  eventId: string;
  imputationDate: string;
  invoiceId: string;
  paymentId: string;
}): Promise<
  | ValidatedPaymentImputationInput
  | Exclude<CreatePaymentImputationResult, { ok: true }>
> {
  if (!input.imputationDate) {
    return {
      ok: false,
      message: "Revisá los datos de la imputación.",
      fieldErrors: {
        imputationDate: "Ingresá la fecha de imputación.",
      },
    };
  }

  if (!isDateOnly(input.imputationDate)) {
    return {
      ok: false,
      message: "Revisá los datos de la imputación.",
      fieldErrors: {
        imputationDate: "Ingresá una fecha válida.",
      },
    };
  }

  if (isFutureDateOnly(input.imputationDate)) {
    return {
      ok: false,
      message: "Revisá los datos de la imputación.",
      fieldErrors: {
        imputationDate: "La fecha de imputación no puede ser futura.",
      },
    };
  }

  const [payment, invoice] = await Promise.all([
    db.query.academyEventPayments.findFirst({
      columns: {
        academyId: true,
        amount: true,
        annulledAt: true,
        eventId: true,
        id: true,
        paymentDate: true,
      },
      where: eq(academyEventPayments.id, input.paymentId),
    }),
    db
      .select({
        academyId: academyEventChoreographyInvoices.academyId,
        basePriceAmount: academyEventChoreographyInvoices.basePriceAmount,
        cancelledAt: academyEventChoreographyInvoices.cancelledAt,
        choreographyId: academyEventChoreographyInvoices.choreographyId,
        depositAmount: academyEventChoreographyInvoices.depositAmount,
        eventId: academyEventChoreographyInvoices.eventId,
        id: academyEventChoreographyInvoices.id,
        issueDate: academyEventChoreographyInvoices.issueDate,
      })
      .from(academyEventChoreographyInvoices)
      .where(eq(academyEventChoreographyInvoices.id, input.invoiceId))
      .then((rows) => rows[0]),
  ]);

  if (
    !payment ||
    !invoice ||
    payment.academyId !== input.academyId ||
    invoice.academyId !== input.academyId ||
    payment.eventId !== input.eventId ||
    invoice.eventId !== input.eventId
  ) {
    return {
      ok: false,
      message: "Revisá los datos de la imputación.",
      fieldErrors: {
        paymentId: "Pago o factura inválidos para esta academia.",
      },
    };
  }

  if (payment.annulledAt || invoice.cancelledAt) {
    return {
      ok: false,
      message: "Revisá los datos de la imputación.",
      fieldErrors: {
        paymentId: "Pago o factura inválidos para esta academia.",
      },
    };
  }

  const [paymentTotals, invoiceTotals, choreography] = await Promise.all([
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
          eq(academyEventInvoiceImputations.paymentId, payment.id),
          isNull(academyEventInvoiceImputations.annulledAt),
        ),
      )
      .then((rows) => Number(rows[0]?.amount ?? 0)),
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
          eq(academyEventInvoiceImputations.invoiceId, invoice.id),
          isNull(academyEventInvoiceImputations.annulledAt),
        ),
      )
      .then((rows) => Number(rows[0]?.amount ?? 0)),
    db
      .select({
        groupType: choreographies.groupType,
        scheduleId: scheduleCapacities.scheduleId,
      })
      .from(choreographies)
      .leftJoin(
        scheduleCapacities,
        eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
      )
      .where(eq(choreographies.id, invoice.choreographyId))
      .then((rows) => rows[0]),
  ]);

  if (input.imputationDate < payment.paymentDate) {
    return {
      ok: false,
      message: "Revisá los datos de la imputación.",
      fieldErrors: {
        imputationDate:
          "La fecha de imputación no puede ser anterior a la fecha del Pago.",
      },
    };
  }

  if (input.imputationDate < invoice.issueDate) {
    return {
      ok: false,
      message: "Revisá los datos de la imputación.",
      fieldErrors: {
        imputationDate:
          "La fecha de imputación no puede ser anterior a la fecha de emisión de la factura.",
      },
    };
  }

  const paymentAvailableAmount = payment.amount - paymentTotals;
  const invoicePendingAmount = invoice.depositAmount - invoiceTotals;

  if (
    !Number.isInteger(input.amount) ||
    input.amount <= 0 ||
    input.amount > paymentAvailableAmount ||
    input.amount > invoicePendingAmount
  ) {
    return {
      ok: false,
      message: "Revisá los datos de la imputación.",
      fieldErrors: {
        amount:
          "La imputación no puede superar el saldo disponible del Pago ni el pendiente de la factura.",
      },
    };
  }

  if (choreography && invoiceTotals + input.amount >= invoice.depositAmount) {
    const applicablePrice = await resolveApplicablePrice({
      eventId: input.eventId,
      groupType: choreography.groupType,
      paymentDate: input.imputationDate,
      scheduleId: choreography.scheduleId,
    });

    if (
      applicablePrice.ok &&
      applicablePrice.price.amount !== invoice.basePriceAmount
    ) {
      return {
        ok: false,
        message: "Revisá los datos de la imputación.",
        fieldErrors: {
          invoiceId:
            "La seña quedó desactualizada con el precio vigente. Cancelala y emitila nuevamente antes de completarla.",
        },
      };
    }
  }

  return {
    ok: true,
    invoice: {
      choreographyId: invoice.choreographyId,
      depositAmount: invoice.depositAmount,
      id: invoice.id,
    },
    invoiceImputedAmount: invoiceTotals,
    payment: {
      id: payment.id,
    },
  };
}
