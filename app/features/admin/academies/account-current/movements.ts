import { aliasedTable as alias, and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
  academyEventInvoiceImputations,
  academyEventPayments,
  choreographies,
  user,
} from "@/db/schema";

type AccountCurrentMovement = {
  actorEmail: string;
  amount: number;
  detail: string;
  key: string;
  label: string;
  occurredOn: string;
  reason: string | null;
};

type PaymentMovementRow = {
  amount: number;
  annulledAt: Date | null;
  annulledByEmail: string | null;
  annulledReason: string | null;
  createdByEmail: string;
  id: string;
  paymentDate: string;
  paymentMethod: string;
  paymentNumber: number;
  reference: string | null;
};

type InvoiceMovementRow = {
  amount: number;
  cancelledAt: Date | null;
  cancelledByEmail: string | null;
  cancelledReason: string | null;
  choreographyName: string;
  createdByEmail: string;
  id: string;
  invoiceNumber: number;
  issueDate: string;
};

type ImputationMovementRow = {
  amount: number;
  annulledAt: Date | null;
  annulledByEmail: string | null;
  annulledReason: string | null;
  choreographyName: string;
  createdByEmail: string;
  id: string;
  imputationDate: string;
  invoiceNumber: number;
  paymentNumber: number;
};

export async function listAccountCurrentMovements(input: {
  academyId: string;
  eventId: string;
}) {
  const paymentCreatedBy = alias(user, "payment_created_by_user");
  const paymentAnnulledBy = alias(user, "payment_annulled_by_user");
  const invoiceCreatedBy = alias(user, "invoice_created_by_user");
  const invoiceCancelledBy = alias(user, "invoice_cancelled_by_user");
  const imputationCreatedBy = alias(user, "imputation_created_by_user");
  const imputationAnnulledBy = alias(user, "imputation_annulled_by_user");

  const payments: PaymentMovementRow[] = await db
    .select({
      amount: academyEventPayments.amount,
      annulledAt: academyEventPayments.annulledAt,
      annulledByEmail: paymentAnnulledBy.email,
      annulledReason: academyEventPayments.annulledReason,
      createdByEmail: paymentCreatedBy.email,
      id: academyEventPayments.id,
      paymentDate: academyEventPayments.paymentDate,
      paymentMethod: academyEventPayments.paymentMethod,
      paymentNumber: academyEventPayments.paymentNumber,
      reference: academyEventPayments.reference,
    })
    .from(academyEventPayments)
    .innerJoin(
      paymentCreatedBy,
      eq(academyEventPayments.createdByUserId, paymentCreatedBy.id),
    )
    .leftJoin(
      paymentAnnulledBy,
      eq(academyEventPayments.annulledByUserId, paymentAnnulledBy.id),
    )
    .where(
      and(
        eq(academyEventPayments.academyId, input.academyId),
        eq(academyEventPayments.eventId, input.eventId),
      ),
    );

  const invoices: InvoiceMovementRow[] = await db
    .select({
      amount: academyEventChoreographyInvoices.depositAmount,
      cancelledAt: academyEventChoreographyInvoices.cancelledAt,
      cancelledByEmail: invoiceCancelledBy.email,
      cancelledReason: academyEventChoreographyInvoices.cancelledReason,
      choreographyName: choreographies.name,
      createdByEmail: invoiceCreatedBy.email,
      id: academyEventChoreographyInvoices.id,
      invoiceNumber: academyEventChoreographyInvoices.invoiceNumber,
      issueDate: academyEventChoreographyInvoices.issueDate,
    })
    .from(academyEventChoreographyInvoices)
    .innerJoin(
      choreographies,
      eq(academyEventChoreographyInvoices.choreographyId, choreographies.id),
    )
    .innerJoin(
      invoiceCreatedBy,
      eq(academyEventChoreographyInvoices.createdByUserId, invoiceCreatedBy.id),
    )
    .leftJoin(
      invoiceCancelledBy,
      eq(
        academyEventChoreographyInvoices.cancelledByUserId,
        invoiceCancelledBy.id,
      ),
    )
    .where(
      and(
        eq(academyEventChoreographyInvoices.academyId, input.academyId),
        eq(academyEventChoreographyInvoices.eventId, input.eventId),
        eq(academyEventChoreographyInvoices.invoiceType, "sena"),
      ),
    );

  const imputations: ImputationMovementRow[] = await db
    .select({
      amount: academyEventInvoiceImputations.amount,
      annulledAt: academyEventInvoiceImputations.annulledAt,
      annulledByEmail: imputationAnnulledBy.email,
      annulledReason: academyEventInvoiceImputations.annulledReason,
      choreographyName: choreographies.name,
      createdByEmail: imputationCreatedBy.email,
      id: academyEventInvoiceImputations.id,
      imputationDate: academyEventInvoiceImputations.imputationDate,
      invoiceNumber: academyEventChoreographyInvoices.invoiceNumber,
      paymentNumber: academyEventPayments.paymentNumber,
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
    .innerJoin(
      imputationCreatedBy,
      eq(
        academyEventInvoiceImputations.createdByUserId,
        imputationCreatedBy.id,
      ),
    )
    .leftJoin(
      imputationAnnulledBy,
      eq(
        academyEventInvoiceImputations.annulledByUserId,
        imputationAnnulledBy.id,
      ),
    )
    .where(
      and(
        eq(academyEventInvoiceImputations.academyId, input.academyId),
        eq(academyEventInvoiceImputations.eventId, input.eventId),
      ),
    );

  const movements: AccountCurrentMovement[] = [];

  for (const payment of payments) {
    movements.push({
      actorEmail: payment.createdByEmail,
      amount: payment.amount,
      detail: [
        "Pago registrado",
        payment.reference ? `Referencia ${payment.reference}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      key: `payment-created-${payment.id}`,
      label: `Pago N° ${payment.paymentNumber} registrado`,
      occurredOn: payment.paymentDate,
      reason: null,
    });

    if (payment.annulledAt && payment.annulledByEmail) {
      movements.push({
        actorEmail: payment.annulledByEmail,
        amount: payment.amount,
        detail: `Pago N° ${payment.paymentNumber}`,
        key: `payment-annulled-${payment.id}`,
        label: `Pago N° ${payment.paymentNumber} anulado`,
        occurredOn: payment.annulledAt.toISOString().slice(0, 10),
        reason: payment.annulledReason,
      });
    }
  }

  for (const invoice of invoices) {
    movements.push({
      actorEmail: invoice.createdByEmail,
      amount: invoice.amount,
      detail: invoice.choreographyName,
      key: `invoice-created-${invoice.id}`,
      label: `Factura de seña N° ${invoice.invoiceNumber} emitida`,
      occurredOn: invoice.issueDate,
      reason: null,
    });

    if (invoice.cancelledAt && invoice.cancelledByEmail) {
      movements.push({
        actorEmail: invoice.cancelledByEmail,
        amount: invoice.amount,
        detail: invoice.choreographyName,
        key: `invoice-cancelled-${invoice.id}`,
        label: `Factura de seña N° ${invoice.invoiceNumber} cancelada`,
        occurredOn: invoice.cancelledAt.toISOString().slice(0, 10),
        reason: invoice.cancelledReason,
      });
    }
  }

  for (const imputation of imputations) {
    const detail = `Pago N° ${imputation.paymentNumber} · Factura N° ${imputation.invoiceNumber} · ${imputation.choreographyName}`;

    movements.push({
      actorEmail: imputation.createdByEmail,
      amount: imputation.amount,
      detail,
      key: `imputation-created-${imputation.id}`,
      label: "Imputación registrada",
      occurredOn: imputation.imputationDate,
      reason: null,
    });

    if (imputation.annulledAt && imputation.annulledByEmail) {
      movements.push({
        actorEmail: imputation.annulledByEmail,
        amount: imputation.amount,
        detail,
        key: `imputation-annulled-${imputation.id}`,
        label: "Imputación anulada",
        occurredOn: imputation.annulledAt.toISOString().slice(0, 10),
        reason: imputation.annulledReason,
      });
    }
  }

  return movements.sort((left, right) => {
    if (left.occurredOn !== right.occurredOn) {
      return left.occurredOn < right.occurredOn ? 1 : -1;
    }

    return left.key < right.key ? 1 : -1;
  });
}
