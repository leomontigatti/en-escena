import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  choreographies,
  choreographyDancers,
  modalities,
  paymentAllocations,
  payments,
} from "@/db/schema";
import {
  workbookResponse,
  workbookSheet,
} from "@/features/admin/day-export/server";
import {
  dateInPeriod,
  readPeriodExport,
} from "@/features/admin/period-export/server";
import { buildPeriodExportFileName } from "@/features/admin/period-export/shared";
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
 * money that arrived in the period, by payment date. `Movimientos` lists each
 * payment and refund; `Por provincia` and `Por modalidad` break the same
 * payments down, so each sums to `Pagos`. `Por modalidad` reads the payments'
 * current allocations — where the money sits today, not on the payment date —
 * with `Seminarios` for seminar allocations and `Sin asignar` for free money.
 *
 * `refund` is specified but not built (#536): until it is, `Reembolsos` is
 * zero and `Movimientos` lists payments only. Refunds never carry allocations,
 * so they will appear in `Movimientos` alone.
 */
export async function loadCollectionExport(
  request: Request,
): Promise<Response> {
  const { eventId, eventName, period } = await readPeriodExport(request);
  const inPeriod = and(
    eq(payments.eventId, eventId),
    dateInPeriod(payments.paymentDate, period),
  );
  // One statement, so the payments and the money allocated from them are read
  // from the same snapshot and the sheets always add up to each other.
  const rows = await db
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
    .where(inPeriod)
    .orderBy(asc(payments.paymentDate), asc(payments.paymentNumber));
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
  const refundsTotal = 0;

  return await workbookResponse({
    fileName: buildPeriodExportFileName("recaudacion", eventName, period),
    sheets: [
      workbookSheet({
        columns: collectionMovementColumns,
        rows: [
          ...paymentRows.map((row): CollectionMovementRow => ({
            ...row,
            kind: "movement",
            type: "payment",
          })),
          { amount: paymentsTotal, kind: "total", label: "Pagos" },
          { amount: refundsTotal, kind: "total", label: "Reembolsos" },
          {
            amount: paymentsTotal - refundsTotal,
            kind: "total",
            label: "Neto",
          },
        ],
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
