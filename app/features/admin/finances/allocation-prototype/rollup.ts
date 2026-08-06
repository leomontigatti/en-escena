/**
 * THROWAWAY PROTOTYPE — ticket #550 of map #547.
 *
 * Per-choreography and per-academy rollups in the shape #551 settled:
 * scope-owned figures, status as the **minimum** over inscriptions (not a
 * high-water mark), and anomalies as a **derived array**, all self-clearing —
 * nothing is persisted and nothing is acknowledged.
 */
import type {
  InscriptionFinancialStatus,
  InscriptionReading,
  PrototypeComprobante,
  PrototypeState,
} from "./fixtures";

/**
 * **One anomaly is left, and the slot is otherwise empty.**
 *
 * - `orphanedAllocations` meant money on an inscription with no price to measure
 *   it against, impossible now that `selectedPriceId` is never null (#550/#553).
 * - `groupTypeMismatch` — #551's replacement — is **deleted by #586**: a
 *   `groupType` change refreshes `selectedPriceId` on the roster write, so the
 *   model cannot produce a price of the wrong group type. It is not merely
 *   unshown here; it cannot happen.
 */
export type ChoreographyAnomaly = "overAllocated";

export const choreographyAnomalyLabels = {
  overAllocated: "Inscripciones sobreasignadas",
} as const satisfies Record<ChoreographyAnomaly, string>;

/**
 * The same anomaly read on a **single** inscription: singular, and worded to
 * echo the list's label so the same problem is recognisable in both places.
 */
export const inscriptionAnomalyLabels = {
  overAllocated: "Sobreasignada",
} as const satisfies Record<ChoreographyAnomaly, string>;

export function readInscriptionAnomalies(
  row: InscriptionReading,
): ChoreographyAnomaly[] {
  return readAnomalies([row]);
}

export type ChoreographyReading = {
  id: string;
  name: string;
  groupType: string;
  inscriptions: InscriptionReading[];
  depositAmount: number;
  totalAmount: number;
  allocatedAmount: number;
  owedDepositAmount: number;
  owedBalanceAmount: number;
  /** The **minimum** across inscriptions, not a high-water mark (#551). */
  status: InscriptionFinancialStatus | null;
  anomalies: ChoreographyAnomaly[];
  /** #585: the factura, and the gap it has opened since it was emitted. */
  comprobante: PrototypeComprobante | null;
  documentedTotal: number | null;
  /**
   * #599: `documented ≠ derived`, and the **sign names the document** — positive
   * owes a nota de débito, negative a nota de crédito. Zero while nothing has
   * moved, and zero while nothing has been emitted.
   */
  delta: number;
};

const statusRank = {
  depositPending: 0,
  depositMet: 1,
  paidInFull: 2,
} as const satisfies Record<InscriptionFinancialStatus, number>;

export function readChoreographies(
  state: PrototypeState,
  inscriptions: InscriptionReading[],
): ChoreographyReading[] {
  return state.choreographies.map((choreography) => {
    const rows = inscriptions.filter(
      (inscription) => inscription.choreographyId === choreography.id,
    );

    const statuses = rows.map((row) => row.status);
    const totalAmount = sumBy(rows, (row) => row.totalAmount);
    const documentedTotal =
      choreography.comprobante === null
        ? null
        : choreography.comprobante.lines.reduce(
            (total, line) => total + line.amount,
            0,
          );

    return {
      id: choreography.id,
      name: choreography.name,
      groupType: choreography.groupType,
      inscriptions: rows,
      comprobante: choreography.comprobante,
      documentedTotal,
      delta: documentedTotal === null ? 0 : totalAmount - documentedTotal,
      depositAmount: sumBy(rows, (row) => row.depositAmount),
      totalAmount,
      allocatedAmount: sumBy(rows, (row) => row.allocatedAmount),
      owedDepositAmount: sumBy(rows, (row) => row.owedDepositAmount),
      owedBalanceAmount: sumBy(rows, (row) => row.owedBalanceAmount),
      // `null` only for a choreography with no inscriptions at all.
      status:
        statuses.length === 0
          ? null
          : statuses.reduce((lowest, status) =>
              statusRank[status] < statusRank[lowest] ? status : lowest,
            ),
      anomalies: readAnomalies(rows),
    };
  });
}

/**
 * Who is affected by each anomaly, not just whether it fires. The alerts name
 * the inscriptions, because #551 wants the alert's *content* to do the work of
 * a conflict resolver — there is no acknowledgement to persist, so the only way
 * it helps is by saying exactly what to fix.
 */
export function readAnomalyTargets(rows: InscriptionReading[]) {
  return {
    // A withdrawn inscription owes zero and still holds money, so it **is**
    // over-allocated (#600). That is the anomaly working, not a false positive.
    overAllocated: rows.filter((row) => row.excessAmount > 0),
  };
}

function readAnomalies(rows: InscriptionReading[]): ChoreographyAnomaly[] {
  const targets = readAnomalyTargets(rows);

  return (
    Object.keys(targets) as (keyof ReturnType<typeof readAnomalyTargets>)[]
  ).filter((anomaly) => targets[anomaly].length > 0);
}

export type AcademyReading = {
  depositAmount: number;
  totalAmount: number;
  owedDepositAmount: number;
  owedBalanceAmount: number;
  /** Gross, not net of what is already allocated (#549's `Saldo disponible` decision). */
  availableBalanceAmount: number;
};

export function readAcademy(
  choreographies: ChoreographyReading[],
  availableBalanceAmount: number,
): AcademyReading {
  return {
    depositAmount: sumBy(choreographies, (row) => row.depositAmount),
    totalAmount: sumBy(choreographies, (row) => row.totalAmount),
    owedDepositAmount: sumBy(choreographies, (row) => row.owedDepositAmount),
    owedBalanceAmount: sumBy(choreographies, (row) => row.owedBalanceAmount),
    availableBalanceAmount,
  };
}

function sumBy<T>(rows: T[], read: (row: T) => number) {
  return rows.reduce((total, row) => total + read(row), 0);
}
