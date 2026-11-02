import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  choreographies,
  choreographyDancers,
  modalities,
  paymentAllocations,
  payments,
  refunds,
} from "@/db/schema";
import {
  workbookResponse,
  workbookSheet,
} from "@/features/admin/day-export/server";
import {
  dateInPeriod,
  readPeriodExport,
} from "@/features/admin/period-export/server";
import {
  buildPeriodExportFileName,
  type ExportPeriod,
} from "@/features/admin/period-export/shared";
import {
  formatProvinceLabel,
  noProvinceLabel,
  provinceOptions,
  type Province,
} from "@/lib/academies/provinces";

import {
  collectionByGroupColumns,
  collectionMovementColumns,
  type CollectionGroupRow,
  type CollectionMovementRow,
} from "./sheet";

/**
 * The `Recaudación` workbook of the selected event, for the auditor: the
 * money that arrived in the period, by payment date, and the money handed
 * back, by refund date. `Movimientos` lists each payment and refund in date
 * order and closes with `Pagos`, `Reembolsos` and `Neto`. `Por provincia` and
 * `Por modalidad` break the payments alone down, so each sums to `Pagos`:
 * refunds carry no allocation. `Por modalidad` reads the payments' current
 * allocations — where the money sits today, not on the payment date — with
 * `Seminarios` for seminar allocations and `Sin asignar` for free money.
 */
export async function loadCollectionExport(
  request: Request,
): Promise<Response> {
  const { eventId, eventName, period } = await readPeriodExport(request);
  const [rows, refundRows] = await Promise.all([
    readPaymentRows(eventId, period),
    readRefundRows(eventId, period),
  ]);
  const paymentRows = [
    ...new Map(rows.map((row) => [row.id, row])).values(),
  ].map(({ academyName, amount, date, method, number, province }) => ({
    academyName,
    amount,
    date,
    method,
    number,
    province,
  }));
  const allocationRows = rows.flatMap(({ allocatedAmount, modalityName }) =>
    allocatedAmount === null ? [] : [{ amount: allocatedAmount, modalityName }],
  );
  const paymentsTotal = sum(paymentRows);
  const refundsTotal = sum(refundRows);
  // The sort is stable: a day's payments come before its refunds, each kind
  // in number order as read.
  const movementRows = [
    ...paymentRows.map(({ province: _province, ...row }) => ({
      ...row,
      kind: "movement" as const,
      type: "payment" as const,
    })),
    ...refundRows.map((row) => ({
      ...row,
      kind: "movement" as const,
      type: "refund" as const,
    })),
  ].sort((left, right) => left.date.localeCompare(right.date));

  return await workbookResponse({
    fileName: buildPeriodExportFileName("recaudacion", eventName, period),
    sheets: [
      workbookSheet({
        columns: collectionMovementColumns,
        rows: [
          ...movementRows,
          { amount: paymentsTotal, kind: "total", label: "Pagos" },
          { amount: refundsTotal, kind: "total", label: "Reembolsos" },
          {
            amount: paymentsTotal - refundsTotal,
            kind: "total",
            label: "Neto",
          },
        ] satisfies CollectionMovementRow[],
        sheet: "Movimientos",
      }),
      workbookSheet({
        columns: collectionByGroupColumns("Provincia"),
        rows: withTotal(groupByProvince(paymentRows), paymentsTotal),
        sheet: "Por provincia",
      }),
      workbookSheet({
        columns: collectionByGroupColumns("Modalidad"),
        rows: withTotal(
          groupByAllocation(allocationRows, paymentsTotal),
          paymentsTotal,
        ),
        sheet: "Por modalidad",
      }),
    ],
  });
}

/**
 * The period's payments, one row per allocation (or one for a payment with
 * none). One statement, so the payments and the money allocated from them are
 * read from the same snapshot and the sheets always add up to each other.
 */
async function readPaymentRows(eventId: string, period: ExportPeriod) {
  return await db
    .select({
      academyName: academies.name,
      allocatedAmount: paymentAllocations.amount,
      amount: payments.amount,
      date: payments.paymentDate,
      id: payments.id,
      method: payments.paymentMethod,
      // Null for a seminar allocation, which has no modality, and for none.
      modalityName: modalities.name,
      number: payments.paymentNumber,
      province: academies.province,
    })
    .from(payments)
    // Every owner's payments, an individual's included (ADR-0019): what was
    // collected is the total, whoever paid it.
    .innerJoin(academies, eq(academies.id, payments.academyId))
    .leftJoin(paymentAllocations, eq(paymentAllocations.paymentId, payments.id))
    .leftJoin(
      choreographyDancers,
      eq(choreographyDancers.id, paymentAllocations.choreographyInscriptionId),
    )
    .leftJoin(
      choreographies,
      eq(choreographies.id, choreographyDancers.choreographyId),
    )
    .leftJoin(modalities, eq(modalities.id, choreographies.modalityId))
    .where(
      and(
        eq(payments.eventId, eventId),
        dateInPeriod(payments.paymentDate, period),
      ),
    )
    .orderBy(asc(payments.paymentDate), asc(payments.paymentNumber));
}

/** The period's refunds, by refund date; every owner's, as with payments. */
async function readRefundRows(eventId: string, period: ExportPeriod) {
  return await db
    .select({
      academyName: academies.name,
      amount: refunds.amount,
      date: refunds.refundDate,
      method: refunds.refundMethod,
      number: refunds.refundNumber,
    })
    .from(refunds)
    .innerJoin(academies, eq(academies.id, refunds.academyId))
    .where(
      and(
        eq(refunds.eventId, eventId),
        dateInPeriod(refunds.refundDate, period),
      ),
    )
    .orderBy(asc(refunds.refundDate), asc(refunds.refundNumber));
}

function sum(rows: readonly { amount: number }[]) {
  return rows.reduce((total, row) => total + row.amount, 0);
}

function withTotal(
  rows: CollectionGroupRow[],
  total: number,
): CollectionGroupRow[] {
  return [...rows, { amount: total, isTotal: true, label: "Total" }];
}

/** The payments by the academy's province, in the list's order, `Sin provincia` last. */
function groupByProvince(
  rows: readonly { amount: number; province: Province | null }[],
): CollectionGroupRow[] {
  const order = [...provinceOptions.map(({ value }) => value), null];

  return order.flatMap((province) => {
    const inProvince = rows.filter((row) => row.province === province);

    return inProvince.length === 0
      ? []
      : [
          {
            amount: sum(inProvince),
            isTotal: false,
            label: formatProvinceLabel(province) ?? noProvinceLabel,
          },
        ];
  });
}

/**
 * The payments by where their money is allocated: one row per modality with
 * money, then `Seminarios` and `Sin asignar`, always shown so the sheet reads
 * the same in every period and visibly sums to `Pagos`.
 */
function groupByAllocation(
  rows: readonly { amount: number; modalityName: string | null }[],
  paymentsTotal: number,
): CollectionGroupRow[] {
  const byModality = new Map<string, number>();

  for (const row of rows) {
    if (row.modalityName !== null) {
      byModality.set(
        row.modalityName,
        (byModality.get(row.modalityName) ?? 0) + row.amount,
      );
    }
  }

  return [
    ...[...byModality]
      .sort(([left], [right]) => left.localeCompare(right, "es"))
      .map(([label, amount]) => ({ amount, isTotal: false, label })),
    {
      amount: sum(rows.filter((row) => row.modalityName === null)),
      isTotal: false,
      label: "Seminarios",
    },
    {
      amount: paymentsTotal - sum(rows),
      isTotal: false,
      label: "Sin asignar",
    },
  ];
}
