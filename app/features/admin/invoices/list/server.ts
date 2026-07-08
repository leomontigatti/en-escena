import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  academyEventChoreographyInvoices,
  academyEventInvoiceImputations,
  choreographies,
} from "@/db/schema";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { getInvoiceState } from "@/lib/finances/payment-imputations.server";

export type AdminInvoiceRow = {
  academyId: string;
  academyName: string;
  amount: number;
  choreographyName: string;
  id: string;
  imputedAmount: number;
  invoiceNumber: number;
  invoiceType: "saldo" | "sena";
  issueDate: string;
  pendingAmount: number;
  status: "cancelada" | "pagada" | "pendiente";
};

export async function loadAdminInvoicesList(request: Request) {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);
  const selectedEventId = eventContext.selectedEventId;

  if (selectedEventId === null) {
    return {
      rows: [] as AdminInvoiceRow[],
      selectedEventId: null,
    };
  }

  const invoiceRows = await db
    .select({
      academyId: academyEventChoreographyInvoices.academyId,
      academyName: academies.name,
      amount: academyEventChoreographyInvoices.depositAmount,
      cancelledAt: academyEventChoreographyInvoices.cancelledAt,
      choreographyName: choreographies.name,
      id: academyEventChoreographyInvoices.id,
      invoiceNumber: academyEventChoreographyInvoices.invoiceNumber,
      invoiceType: academyEventChoreographyInvoices.invoiceType,
      issueDate: academyEventChoreographyInvoices.issueDate,
    })
    .from(academyEventChoreographyInvoices)
    .innerJoin(
      academies,
      eq(academyEventChoreographyInvoices.academyId, academies.id),
    )
    .innerJoin(
      choreographies,
      eq(academyEventChoreographyInvoices.choreographyId, choreographies.id),
    )
    .where(eq(academyEventChoreographyInvoices.eventId, selectedEventId))
    .orderBy(
      desc(academyEventChoreographyInvoices.issueDate),
      desc(academyEventChoreographyInvoices.invoiceNumber),
    );

  const imputationTotals = await listActiveInvoiceImputationTotals(
    invoiceRows.map((invoice) => invoice.id),
  );

  return {
    rows: invoiceRows.map<AdminInvoiceRow>((invoice) => {
      const isCancelled = invoice.cancelledAt !== null;
      const imputedAmount = isCancelled
        ? 0
        : (imputationTotals.get(invoice.id) ?? 0);
      const status: AdminInvoiceRow["status"] = isCancelled
        ? "cancelada"
        : getInvoiceState({
            amount: invoice.amount,
            imputedAmount,
          });

      return {
        academyId: invoice.academyId,
        academyName: invoice.academyName,
        amount: invoice.amount,
        choreographyName: invoice.choreographyName,
        id: invoice.id,
        imputedAmount,
        invoiceNumber: invoice.invoiceNumber,
        invoiceType: invoice.invoiceType,
        issueDate: invoice.issueDate,
        pendingAmount: isCancelled
          ? 0
          : Math.max(0, invoice.amount - imputedAmount),
        status,
      };
    }),
    selectedEventId,
  };
}

async function listActiveInvoiceImputationTotals(invoiceIds: string[]) {
  if (invoiceIds.length === 0) {
    return new Map<string, number>();
  }

  const rows = await db.query.academyEventInvoiceImputations.findMany({
    columns: {
      amount: true,
      invoiceId: true,
    },
    where: and(
      inArray(academyEventInvoiceImputations.invoiceId, invoiceIds),
      isNull(academyEventInvoiceImputations.annulledAt),
    ),
  });

  const totals = new Map<string, number>();

  for (const row of rows) {
    totals.set(row.invoiceId, (totals.get(row.invoiceId) ?? 0) + row.amount);
  }

  return totals;
}
