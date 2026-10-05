import { moneyCell, type SheetColumn } from "@/features/admin/day-export/sheet";

/**
 * A seminar's sheet: one row per inscription, active or withdrawn, then a
 * total row. A withdrawn inscription is off the roster but still holds what
 * was allocated to it, so it stays, marked `Retirada`. An amount that depends
 * on a price is blank while the inscription has none, and so is the total of
 * that column, rather than a partial sum that reads as complete.
 */

export type SeminarInscriptionFigures = {
  /** `Pagado`: what the inscription has allocated. Never unknown. */
  allocatedAmount: number;
  depositAmount: number | null;
  /** `Seña pagada`: what is allocated, up to the deposit. */
  depositPaidAmount: number | null;
  owedBalanceAmount: number | null;
  totalAmount: number | null;
};

export type SeminarInscriptionSheetRow = SeminarInscriptionFigures &
  (
    | {
        academyName: string;
        fullName: string;
        instructorName: string;
        kind: "inscription";
        personKind: "dancer" | "professor";
        withdrawn: boolean;
      }
    | { kind: "total" }
  );

function inscriptionOnly<Value>(
  read: (
    row: Extract<SeminarInscriptionSheetRow, { kind: "inscription" }>,
  ) => Value,
) {
  return (row: SeminarInscriptionSheetRow) =>
    row.kind === "inscription" ? read(row) : null;
}

function amount(read: (row: SeminarInscriptionSheetRow) => number | null) {
  return (row: SeminarInscriptionSheetRow) => {
    const value = read(row);

    return value === null ? null : moneyCell(value, row.kind === "total");
  };
}

export const seminarInscriptionColumns: SheetColumn<SeminarInscriptionSheetRow>[] =
  [
    {
      header: "Instructor",
      width: 28,
      cell: (row) =>
        row.kind === "total"
          ? { fontWeight: "bold", value: "Total" }
          : row.instructorName,
    },
    {
      header: "Nombre completo",
      width: 30,
      cell: inscriptionOnly((row) => row.fullName),
    },
    {
      header: "Tipo",
      width: 12,
      cell: inscriptionOnly((row) =>
        row.personKind === "professor" ? "Profesor" : "Bailarín",
      ),
    },
    {
      header: "Estado",
      width: 12,
      cell: inscriptionOnly((row) => (row.withdrawn ? "Retirada" : "Activa")),
    },
    {
      header: "Academia",
      width: 30,
      cell: inscriptionOnly((row) => row.academyName),
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
