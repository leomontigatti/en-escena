import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
  academyEventInvoiceImputations,
  academyEventPayments,
} from "@/db/schema";

export type CorrectionResult =
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

type CorrectionFieldName = "imputationId" | "invoiceId" | "paymentId";

type ActiveImputationRow = {
  amount: number;
  imputationDate: string;
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
    return missingReasonResult();
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
    return invalidCorrectionTargetResult({
      fieldName: "imputationId",
      message: "Imputación inválida para esta academia.",
    });
  }

  await db.transaction(async (tx) => {
    const now = new Date();

    await tx
      .update(academyEventInvoiceImputations)
      .set({
        annulledAt: now,
        annulledByUserId: input.annulledByUserId,
        annulledReason: reason,
        updatedAt: now,
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

    await tx
      .update(academyEventChoreographyInvoices)
      .set({
        depositCompletedOn: getDepositCompletedOn({
          activeImputations,
          depositAmount: invoice.depositAmount,
        }),
        updatedAt: now,
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
    return missingReasonResult();
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
    return invalidCorrectionTargetResult({
      fieldName: "invoiceId",
      message: "Factura inválida para esta academia.",
    });
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
    return invalidCorrectionTargetResult({
      fieldName: "invoiceId",
      message: "Anulá primero las imputaciones activas de esta factura.",
    });
  }

  const now = new Date();

  await db
    .update(academyEventChoreographyInvoices)
    .set({
      cancelledAt: now,
      cancelledByUserId: input.cancelledByUserId,
      cancelledReason: reason,
      updatedAt: now,
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
    return missingReasonResult();
  }

  return await markPaymentAnnulled({
    academyId: input.academyId,
    annulledByUserId: input.annulledByUserId,
    eventId: input.eventId,
    paymentId: input.paymentId,
    reason,
  });
}

export async function deletePaymentWithoutReason(input: {
  academyId: string;
  deletedByUserId: string;
  eventId: string;
  paymentId: string;
}): Promise<CorrectionResult> {
  return await markPaymentAnnulled({
    academyId: input.academyId,
    annulledByUserId: input.deletedByUserId,
    eventId: input.eventId,
    paymentId: input.paymentId,
    reason: null,
  });
}

async function markPaymentAnnulled(input: {
  academyId: string;
  annulledByUserId: string;
  eventId: string;
  paymentId: string;
  reason: string | null;
}): Promise<CorrectionResult> {
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
    return invalidCorrectionTargetResult({
      fieldName: "paymentId",
      message: "Pago inválido para esta academia.",
    });
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
    return invalidCorrectionTargetResult({
      fieldName: "paymentId",
      message: "Anulá primero las imputaciones activas de este Pago.",
    });
  }

  const now = new Date();

  await db
    .update(academyEventPayments)
    .set({
      annulledAt: now,
      annulledByUserId: input.annulledByUserId,
      annulledReason: input.reason,
      updatedAt: now,
    })
    .where(eq(academyEventPayments.id, payment.id));

  return { ok: true };
}

function missingReasonResult(): CorrectionResult {
  return {
    ok: false,
    message: "Revisá los datos de la corrección.",
    fieldErrors: {
      reason: "Ingresá un motivo para registrar esta corrección.",
    },
  };
}

function invalidCorrectionTargetResult(input: {
  fieldName: CorrectionFieldName;
  message: string;
}): CorrectionResult {
  return {
    ok: false,
    message: "No pudimos registrar la corrección.",
    fieldErrors: {
      [input.fieldName]: input.message,
    },
  };
}

function getDepositCompletedOn(input: {
  activeImputations: ActiveImputationRow[];
  depositAmount: number;
}) {
  let runningAmount = 0;

  for (const activeImputation of input.activeImputations) {
    runningAmount += activeImputation.amount;

    if (runningAmount >= input.depositAmount) {
      return activeImputation.imputationDate;
    }
  }

  return null;
}
