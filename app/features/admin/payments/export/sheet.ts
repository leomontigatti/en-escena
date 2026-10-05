import type { SheetColumn } from "@/features/admin/day-export/sheet";
import {
  formatPaymentMethodLabel,
  type PaymentMethod,
} from "@/lib/finances/payment-methods";

/**
 * The `Recaudación` workbook's sheets. `Movimientos` lists each payment and
 * refund of the period and closes with the `Pagos`, `Reembolsos` and net
 * totals; the grouped sheets break the same payments down by province and by
 * modality. Amounts are whole pesos, written as numbers in a money format.
 */

export const moneyFormat = '"$"#,##0';

export type CollectionMovementRow =
  | {
      academyName: string;
      amount: number;
      /** A date-only value. */
      date: string;
      kind: "movement";
      method: PaymentMethod;
      number: number;
      /** A `refund` slots in here once it is built (#536). */
      type: "payment" | "refund";
    }
  | { amount: number; kind: "total"; label: string };

const movementTypeLabels = {
  payment: "Pago",
  refund: "Reembolso",
} as const;

function money(amount: number, bold = false) {
  return {
    ...(bold ? { fontWeight: "bold" as const } : {}),
    format: moneyFormat,
    type: Number,
    value: amount,
  };
}

function movementOnly<Value>(
  read: (row: Extract<CollectionMovementRow, { kind: "movement" }>) => Value,
) {
  return (row: CollectionMovementRow) =>
    row.kind === "movement" ? read(row) : null;
}

export const collectionMovementColumns: SheetColumn<CollectionMovementRow>[] = [
  {
    header: "Movimiento",
    width: 14,
    cell: (row) =>
      row.kind === "movement"
        ? movementTypeLabels[row.type]
        : { fontWeight: "bold", value: row.label },
  },
  { header: "Número", width: 10, cell: movementOnly((row) => row.number) },
  {
    header: "Fecha",
    width: 12,
    cell: movementOnly((row) => ({
      format: "dd/mm/yyyy",
      type: Date,
      value: new Date(`${row.date}T00:00:00Z`),
    })),
  },
  {
    header: "Academia",
    width: 30,
    cell: movementOnly((row) => row.academyName),
  },
  {
    header: "Medio",
    width: 16,
    cell: movementOnly((row) => formatPaymentMethodLabel(row.method)),
  },
  {
    header: "Monto",
    width: 16,
    cell: (row) => money(row.amount, row.kind === "total"),
  },
];

export type CollectionGroupRow = {
  amount: number;
  /** The closing row, the sum of the rows above it. */
  isTotal: boolean;
  label: string;
};

export function collectionByGroupColumns(
  groupHeader: string,
): SheetColumn<CollectionGroupRow>[] {
  return [
    {
      header: groupHeader,
      width: 32,
      cell: (row) =>
        row.isTotal ? { fontWeight: "bold", value: row.label } : row.label,
    },
    {
      header: "Monto",
      width: 16,
      cell: (row) => money(row.amount, row.isTotal),
    },
  ];
}
