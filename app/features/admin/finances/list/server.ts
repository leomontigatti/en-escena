import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { academies, choreographies, payments } from "@/db/schema";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import {
  emptyOperationalFinanceSummary,
  type OperationalFinanceAmount,
} from "@/lib/finances/operational-summary";
import { readAcademyEventOperationalFinanceSummaries } from "@/lib/finances/operational-summary.server";

export type FinanceAccountRow = {
  academyId: string;
  academyName: string;
  availableBalanceAmount: number;
  owedAmount: OperationalFinanceAmount;
  owedDepositAmount: OperationalFinanceAmount;
};

export async function loadAdminFinanceAccountCurrentList(request: Request) {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);
  const selectedEventId = eventContext.selectedEventId;

  if (selectedEventId === null) {
    return {
      rows: [] as FinanceAccountRow[],
      selectedEventId: null,
    };
  }

  const academyIds = await listAcademyIdsForEvent(selectedEventId);

  if (academyIds.length === 0) {
    return {
      rows: [] as FinanceAccountRow[],
      selectedEventId,
    };
  }

  const [academyRows, summaries] = await Promise.all([
    db.query.academies.findMany({
      columns: {
        id: true,
        name: true,
      },
      where: inArray(academies.id, academyIds),
      orderBy: [academies.name],
    }),
    readAcademyEventOperationalFinanceSummaries({
      academyIds,
      eventId: selectedEventId,
    }),
  ]);

  return {
    rows: academyRows.map((academy) => {
      const summary =
        summaries.get(academy.id) ?? emptyOperationalFinanceSummary();

      return {
        academyId: academy.id,
        academyName: academy.name,
        availableBalanceAmount: summary.availableBalanceAmount,
        owedAmount: summary.owedAmount,
        owedDepositAmount: summary.owedDepositAmount,
      };
    }),
    selectedEventId,
  };
}

async function listAcademyIdsForEvent(eventId: string) {
  const [academyIdsWithChoreographies, academyIdsWithPayments] =
    await Promise.all([
      db
        .selectDistinct({
          academyId: choreographies.academyId,
        })
        .from(choreographies)
        .where(eq(choreographies.eventId, eventId)),
      db
        .selectDistinct({
          academyId: payments.academyId,
        })
        .from(payments)
        .where(eq(payments.eventId, eventId)),
    ]);

  return [
    ...new Set([
      ...academyIdsWithChoreographies.map((row) => row.academyId),
      ...academyIdsWithPayments.map((row) => row.academyId),
    ]),
  ];
}
