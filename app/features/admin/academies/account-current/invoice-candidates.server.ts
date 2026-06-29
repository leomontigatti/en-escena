import { and, asc, eq, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
  choreographies,
  modalities,
  scheduleCapacities,
  schedules,
  submodalities,
} from "@/db/schema";
import { resolveApplicablePrice } from "@/lib/events/bases-repository.server";
import { listActiveInvoiceChoreographyIds } from "@/lib/finances/choreography-invoices.server";

export async function readDepositInvoiceCandidates(input: {
  academyId: string;
  eventId: string;
}) {
  const choreographyRows = await db
    .select({
      createdAt: choreographies.createdAt,
      id: choreographies.id,
      modalityName: modalities.name,
      name: choreographies.name,
      groupType: choreographies.groupType,
      scheduleId: schedules.id,
      submodalityName: submodalities.name,
    })
    .from(choreographies)
    .innerJoin(modalities, eq(choreographies.modalityId, modalities.id))
    .leftJoin(submodalities, eq(choreographies.submodalityId, submodalities.id))
    .leftJoin(
      scheduleCapacities,
      eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
    )
    .leftJoin(
      schedules,
      or(
        eq(choreographies.scheduleId, schedules.id),
        eq(scheduleCapacities.scheduleId, schedules.id),
      ),
    )
    .where(
      and(
        eq(choreographies.academyId, input.academyId),
        eq(choreographies.eventId, input.eventId),
      ),
    )
    .orderBy(asc(choreographies.name), asc(choreographies.createdAt));

  const activeInvoiceIds = await listActiveInvoiceChoreographyIds(
    choreographyRows.map((row) => row.id),
  );
  const eligibleRows = choreographyRows.filter(
    (row) => !activeInvoiceIds.has(row.id),
  );

  return await Promise.all(
    eligibleRows.map(async (row) => {
      const priceResult = await resolveApplicablePrice({
        eventId: input.eventId,
        groupType: row.groupType,
        paymentDate: new Date(),
        scheduleId: row.scheduleId,
      });

      return {
        createdOn: row.createdAt.toISOString().slice(0, 10),
        estimatedBasePriceAmount: priceResult.ok
          ? priceResult.price.amount
          : null,
        id: row.id,
        modalityLabel: [row.modalityName, row.submodalityName]
          .filter(Boolean)
          .join(" / "),
        name: row.name,
        selectedPaymentDeadline:
          priceResult.ok === true ? priceResult.price.paymentDeadline : null,
      };
    }),
  );
}

export async function readBalanceInvoiceCandidates(input: {
  academyId: string;
  eventId: string;
}) {
  const choreographyRows = await db
    .select({
      id: choreographies.id,
      name: choreographies.name,
    })
    .from(choreographies)
    .where(
      and(
        eq(choreographies.academyId, input.academyId),
        eq(choreographies.eventId, input.eventId),
      ),
    )
    .orderBy(asc(choreographies.name), asc(choreographies.createdAt));

  const [activeBalanceInvoiceIds, paidDepositInvoices] = await Promise.all([
    listActiveInvoiceChoreographyIds(
      choreographyRows.map((row) => row.id),
      "saldo",
    ),
    db.query.academyEventChoreographyInvoices.findMany({
      columns: {
        choreographyId: true,
        depositCompletedOn: true,
      },
      where: and(
        eq(academyEventChoreographyInvoices.academyId, input.academyId),
        eq(academyEventChoreographyInvoices.eventId, input.eventId),
        eq(academyEventChoreographyInvoices.invoiceType, "sena"),
        isNull(academyEventChoreographyInvoices.cancelledAt),
      ),
    }),
  ]);

  const paidDepositIds = new Set(
    paidDepositInvoices
      .filter((invoice) => invoice.depositCompletedOn !== null)
      .map((invoice) => invoice.choreographyId),
  );

  return choreographyRows.filter(
    (row) => paidDepositIds.has(row.id) && !activeBalanceInvoiceIds.has(row.id),
  );
}
