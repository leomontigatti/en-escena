import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
  academyEventInvoiceImputations,
  academyEventPayments,
} from "@/db/schema";

type CorrectionResult =
  | { ok: true }
  | {
      ok: false;
      fieldErrors: {
        imputationId?: string;
        invoiceId?: string;
        paymentId?: string;
        reason?: string;
      };
      message: string;
    };

export async function annulPaymentImputation(input: {
  academyId: string;
  annulledByUserId: string;
  eventId: string;
  imputationId: string;
  reason: string;
}): Promise<CorrectionResult> {
  const reason = input.reason.trim();

  if (!reason) {
    return {
      ok: false,
      message: "Revisá los datos de la corrección.",
      fieldErrors: {
        reason: "Ingresá un motivo para registrar esta corrección.",
      },
    };
  }

  const imputation = await db.query.academyEventInvoiceImputations.findFirst({
    columns: {
      academyId: true,
      annulledAt: true,
      eventId: true,
      id: true,
      invoiceId: true,
    },
    where: eq(academyEventInvoiceImputations.id, input.imputationId),
  });

  if (
    !imputation ||
    imputation.academyId !== input.academyId ||
    imputation.eventId !== input.eventId ||
    imputation.annulledAt
  ) {
    return {
      ok: false,
      message: "No pudimos registrar la corrección.",
      fieldErrors: {
        imputationId: "Imputación inválida para esta academia.",
      },
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(academyEventInvoiceImputations)
      .set({
        annulledAt: new Date(),
        annulledByUserId: input.annulledByUserId,
        annulledReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(academyEventInvoiceImputations.id, imputation.id));

    const invoice = await tx.query.academyEventChoreographyInvoices.findFirst({
      columns: {
        depositAmount: true,
        id: true,
      },
      where: eq(academyEventChoreographyInvoices.id, imputation.invoiceId),
    });

    if (!invoice) {
      throw new Error("Expected invoice for imputation annulment.");
    }

    const activeImputations = await tx
      .select({
        amount: academyEventInvoiceImputations.amount,
        imputationDate: academyEventInvoiceImputations.imputationDate,
      })
      .from(academyEventInvoiceImputations)
      .where(
        and(
          eq(academyEventInvoiceImputations.invoiceId, invoice.id),
          isNull(academyEventInvoiceImputations.annulledAt),
        ),
      )
      .orderBy(
        asc(academyEventInvoiceImputations.imputationDate),
        asc(academyEventInvoiceImputations.createdAt),
      );

    let runningAmount = 0;
    let depositCompletedOn: string | null = null;

    for (const activeImputation of activeImputations) {
      runningAmount += activeImputation.amount;

      if (runningAmount >= invoice.depositAmount) {
        depositCompletedOn = activeImputation.imputationDate;
        break;
      }
    }

    await tx
      .update(academyEventChoreographyInvoices)
      .set({
        depositCompletedOn,
        updatedAt: new Date(),
      })
      .where(eq(academyEventChoreographyInvoices.id, invoice.id));
  });

  return { ok: true };
}

export async function cancelDepositInvoice(input: {
  academyId: string;
  cancelledByUserId: string;
  eventId: string;
  invoiceId: string;
  reason: string;
}): Promise<CorrectionResult> {
  const reason = input.reason.trim();

  if (!reason) {
    return {
      ok: false,
      message: "Revisá los datos de la corrección.",
      fieldErrors: {
        reason: "Ingresá un motivo para registrar esta corrección.",
      },
    };
  }

  const invoice = await db.query.academyEventChoreographyInvoices.findFirst({
    columns: {
      academyId: true,
      cancelledAt: true,
      eventId: true,
      id: true,
    },
    where: eq(academyEventChoreographyInvoices.id, input.invoiceId),
  });

  if (
    !invoice ||
    invoice.academyId !== input.academyId ||
    invoice.eventId !== input.eventId ||
    invoice.cancelledAt
  ) {
    return {
      ok: false,
      message: "No pudimos registrar la corrección.",
      fieldErrors: {
        invoiceId: "Factura inválida para esta academia.",
      },
    };
  }

  const activeImputation =
    await db.query.academyEventInvoiceImputations.findFirst({
      columns: {
        id: true,
      },
      where: and(
        eq(academyEventInvoiceImputations.invoiceId, invoice.id),
        isNull(academyEventInvoiceImputations.annulledAt),
      ),
    });

  if (activeImputation) {
    return {
      ok: false,
      message: "No pudimos registrar la corrección.",
      fieldErrors: {
        invoiceId: "Anulá primero las imputaciones activas de esta factura.",
      },
    };
  }

  await db
    .update(academyEventChoreographyInvoices)
    .set({
      cancelledAt: new Date(),
      cancelledByUserId: input.cancelledByUserId,
      cancelledReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(academyEventChoreographyInvoices.id, invoice.id));

  return { ok: true };
}

export async function annulPayment(input: {
  academyId: string;
  annulledByUserId: string;
  eventId: string;
  paymentId: string;
  reason: string;
}): Promise<CorrectionResult> {
  const reason = input.reason.trim();

  if (!reason) {
    return {
      ok: false,
      message: "Revisá los datos de la corrección.",
      fieldErrors: {
        reason: "Ingresá un motivo para registrar esta corrección.",
      },
    };
  }

  const payment = await db.query.academyEventPayments.findFirst({
    columns: {
      academyId: true,
      annulledAt: true,
      eventId: true,
      id: true,
    },
    where: eq(academyEventPayments.id, input.paymentId),
  });

  if (
    !payment ||
    payment.academyId !== input.academyId ||
    payment.eventId !== input.eventId ||
    payment.annulledAt
  ) {
    return {
      ok: false,
      message: "No pudimos registrar la corrección.",
      fieldErrors: {
        paymentId: "Pago inválido para esta academia.",
      },
    };
  }

  const activeImputation =
    await db.query.academyEventInvoiceImputations.findFirst({
      columns: {
        id: true,
      },
      where: and(
        eq(academyEventInvoiceImputations.paymentId, payment.id),
        isNull(academyEventInvoiceImputations.annulledAt),
      ),
    });

  if (activeImputation) {
    return {
      ok: false,
      message: "No pudimos registrar la corrección.",
      fieldErrors: {
        paymentId: "Anulá primero las imputaciones activas de este Pago.",
      },
    };
  }

  await db
    .update(academyEventPayments)
    .set({
      annulledAt: new Date(),
      annulledByUserId: input.annulledByUserId,
      annulledReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(academyEventPayments.id, payment.id));

  return { ok: true };
}
