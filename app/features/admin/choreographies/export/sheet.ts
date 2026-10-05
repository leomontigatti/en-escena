import { moneyCell, type SheetColumn } from "@/features/admin/day-export/sheet";

/**
 * The participation counts as a spreadsheet: one row per province or per
 * modality, then a total row. Academies and dancers are distinct counts, so a
 * dancer in two modalities is in both rows and once in the total.
 */

export type ParticipationCountRow = {
  academies: number;
  dancers: number;
  inscriptions: number;
  /** The closing row, which counts each academy and dancer once. */
  isTotal: boolean;
  label: string;
};

function emphasised(row: ParticipationCountRow, value: number | string) {
  return row.isTotal ? { fontWeight: "bold" as const, value } : value;
}

export function participationCountColumns(
  groupHeader: string,
): SheetColumn<ParticipationCountRow>[] {
  return [
    {
      header: groupHeader,
      width: 32,
      cell: (row) => emphasised(row, row.label),
    },
    {
      header: "Academias",
      width: 12,
      cell: (row) => emphasised(row, row.academies),
    },
    {
      header: "Bailarines",
      width: 12,
      cell: (row) => emphasised(row, row.dancers),
    },
    {
      header: "Inscripciones",
      width: 14,
      cell: (row) => emphasised(row, row.inscriptions),
    },
  ];
}

/**
 * `Por coreografía`: one row per choreography, then a total row. The counts
 * and the money are of the inscriptions registered in the period. A withdrawn
 * inscription is not an `Inscripción` any more but still holds money, so it is
 * counted apart and its figures are in the amounts. An amount that depends on
 * a price is blank while one of the row's inscriptions has none, rather than
 * a partial sum that reads as complete.
 */

export type ChoreographyFinanceFigures = {
  /** `Pagado`: what the inscriptions have allocated. Never unknown. */
  allocatedAmount: number;
  dancerDiscountAmount: number | null;
  depositAmount: number | null;
  /** `Seña pagada`: per inscription, what is allocated up to its deposit. */
  depositPaidAmount: number | null;
  /** Active inscriptions only, as in the two count sheets. */
  inscriptions: number;
  owedBalanceAmount: number | null;
  totalAmount: number | null;
  withdrawnInscriptions: number;
};

export type ChoreographyFinanceRow = ChoreographyFinanceFigures &
  (
    | {
        academyName: string;
        kind: "choreography";
        modalityName: string;
        name: string;
        number: number;
      }
    | { kind: "total" }
  );

function choreographyOnly<Value>(
  read: (
    row: Extract<ChoreographyFinanceRow, { kind: "choreography" }>,
  ) => Value,
) {
  return (row: ChoreographyFinanceRow) =>
    row.kind === "choreography" ? read(row) : null;
}

function count(read: (row: ChoreographyFinanceRow) => number) {
  return (row: ChoreographyFinanceRow) =>
    row.kind === "total"
      ? { fontWeight: "bold" as const, value: read(row) }
      : read(row);
}

function amount(read: (row: ChoreographyFinanceRow) => number | null) {
  return (row: ChoreographyFinanceRow) => {
    const value = read(row);

    return value === null ? null : moneyCell(value, row.kind === "total");
  };
}

export const choreographyFinanceColumns: SheetColumn<ChoreographyFinanceRow>[] =
  [
    {
      header: "#",
      width: 8,
      cell: (row) =>
        row.kind === "total"
          ? { fontWeight: "bold", value: "Total" }
          : row.number,
    },
    {
      header: "Coreografía",
      width: 32,
      cell: choreographyOnly((row) => row.name),
    },
    {
      header: "Academia",
      width: 30,
      cell: choreographyOnly((row) => row.academyName),
    },
    {
      header: "Modalidad",
      width: 20,
      cell: choreographyOnly((row) => row.modalityName),
    },
    {
      header: "Inscripciones",
      width: 14,
      cell: count((row) => row.inscriptions),
    },
    {
      header: "Retiradas",
      width: 12,
      cell: count((row) => row.withdrawnInscriptions),
    },
    {
      header: "Descuento por bailarín",
      width: 22,
      cell: amount((row) => row.dancerDiscountAmount),
    },
    { header: "Seña", width: 16, cell: amount((row) => row.depositAmount) },
    {
      header: "Seña pagada",
      width: 16,
      cell: amount((row) => row.depositPaidAmount),
    },
    { header: "Total", width: 16, cell: amount((row) => row.totalAmount) },
    { header: "Pagado", width: 16, cell: amount((row) => row.allocatedAmount) },
    {
      header: "Saldo adeudado",
      width: 16,
      cell: amount((row) => row.owedBalanceAmount),
    },
  ];
