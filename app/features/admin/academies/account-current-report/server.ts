import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  academyEventChoreographyInvoices,
  academyEventInvoiceImputations,
  academyEventPayments,
  choreographies,
} from "@/db/schema";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

type SummaryRow = {
  academyId: string;
  academyName: string;
  availableBalanceAmount: number;
  owedAmount: number;
  totalPaidAmount: number;
};

export async function loadAdministrativeAcademyAccountCurrentReport(
  request: Request,
) {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.selectedEventId === null) {
    return {
      rows: [] as SummaryRow[],
      selectedEventId: null,
    };
  }

  const academyIds = await listAcademyIdsForEvent(eventContext.selectedEventId);

  if (academyIds.length === 0) {
    return {
      rows: [] as SummaryRow[],
      selectedEventId: eventContext.selectedEventId,
    };
  }

  const [academyRows, paymentRows, invoiceRows, imputationRows] =
    await Promise.all([
      db.query.academies.findMany({
        columns: {
          id: true,
          name: true,
        },
        where: inArray(academies.id, academyIds),
        orderBy: [asc(academies.name)],
      }),
      db
        .select({
          academyId: academyEventPayments.academyId,
          totalPaidAmount:
            sql<number>`coalesce(sum(${academyEventPayments.amount}), 0)`.mapWith(
              Number,
            ),
        })
        .from(academyEventPayments)
        .where(
          and(
            eq(academyEventPayments.eventId, eventContext.selectedEventId),
            inArray(academyEventPayments.academyId, academyIds),
            isNull(academyEventPayments.annulledAt),
          ),
        )
        .groupBy(academyEventPayments.academyId),
      db
        .select({
          academyId: academyEventChoreographyInvoices.academyId,
          totalInvoiceAmount:
            sql<number>`coalesce(sum(${academyEventChoreographyInvoices.depositAmount}), 0)`.mapWith(
              Number,
            ),
        })
        .from(academyEventChoreographyInvoices)
        .where(
          and(
            eq(
              academyEventChoreographyInvoices.eventId,
              eventContext.selectedEventId,
            ),
            inArray(academyEventChoreographyInvoices.academyId, academyIds),
            isNull(academyEventChoreographyInvoices.cancelledAt),
          ),
        )
        .groupBy(academyEventChoreographyInvoices.academyId),
      db
        .select({
          academyId: academyEventInvoiceImputations.academyId,
          totalImputedAmount:
            sql<number>`coalesce(sum(${academyEventInvoiceImputations.amount}), 0)`.mapWith(
              Number,
            ),
        })
        .from(academyEventInvoiceImputations)
        .where(
          and(
            eq(
              academyEventInvoiceImputations.eventId,
              eventContext.selectedEventId,
            ),
            inArray(academyEventInvoiceImputations.academyId, academyIds),
            isNull(academyEventInvoiceImputations.annulledAt),
          ),
        )
        .groupBy(academyEventInvoiceImputations.academyId),
    ]);

  const paymentTotals = new Map(
    paymentRows.map((row) => [row.academyId, Number(row.totalPaidAmount)]),
  );
  const invoiceTotals = new Map(
    invoiceRows.map((row) => [row.academyId, Number(row.totalInvoiceAmount)]),
  );
  const imputationTotals = new Map(
    imputationRows.map((row) => [
      row.academyId,
      Number(row.totalImputedAmount),
    ]),
  );

  return {
    rows: academyRows.map((academy) => {
      const totalPaidAmount = paymentTotals.get(academy.id) ?? 0;
      const totalInvoiceAmount = invoiceTotals.get(academy.id) ?? 0;
      const totalImputedAmount = imputationTotals.get(academy.id) ?? 0;

      return {
        academyId: academy.id,
        academyName: academy.name,
        availableBalanceAmount: totalPaidAmount - totalImputedAmount,
        owedAmount: Math.max(0, totalInvoiceAmount - totalImputedAmount),
        totalPaidAmount,
      };
    }),
    selectedEventId: eventContext.selectedEventId,
  };
}

async function listAcademyIdsForEvent(eventId: string) {
  const [
    academyIdsWithChoreographies,
    academyIdsWithPayments,
    academyIdsWithInvoices,
  ] = await Promise.all([
    db
      .selectDistinct({
        academyId: choreographies.academyId,
      })
      .from(choreographies)
      .where(eq(choreographies.eventId, eventId)),
    db
      .selectDistinct({
        academyId: academyEventPayments.academyId,
      })
      .from(academyEventPayments)
      .where(
        and(
          eq(academyEventPayments.eventId, eventId),
          isNull(academyEventPayments.annulledAt),
        ),
      ),
    db
      .selectDistinct({
        academyId: academyEventChoreographyInvoices.academyId,
      })
      .from(academyEventChoreographyInvoices)
      .where(
        and(
          eq(academyEventChoreographyInvoices.eventId, eventId),
          isNull(academyEventChoreographyInvoices.cancelledAt),
        ),
      ),
  ]);

  return [
    ...new Set([
      ...academyIdsWithChoreographies.map((row) => row.academyId),
      ...academyIdsWithPayments.map((row) => row.academyId),
      ...academyIdsWithInvoices.map((row) => row.academyId),
    ]),
  ];
}
