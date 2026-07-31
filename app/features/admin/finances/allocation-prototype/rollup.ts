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
  PrototypeState,
} from "./fixtures";

/**
 * #551's anomalies, minus `orphanedAllocations`: it meant money sitting on an
 * inscription with no price to measure it against, and that cannot happen now
 * that `selectedPriceId` is never null.
 */
export type ChoreographyAnomaly = "groupTypeMismatch" | "overAllocated";

export const choreographyAnomalyLabels = {
  groupTypeMismatch: "Precios de otro tipo de grupo",
  overAllocated: "Inscripciones sobreasignadas",
} as const satisfies Record<ChoreographyAnomaly, string>;

/**
 * The same two anomalies read on a **single** inscription: singular, and worded
 * to echo the list's labels so the same problem is recognisable in both places.
 */
export const inscriptionAnomalyLabels = {
  groupTypeMismatch: "Precio de otro tipo de grupo",
  overAllocated: "Sobreasignada",
} as const satisfies Record<ChoreographyAnomaly, string>;

export function readInscriptionAnomalies(
  groupType: string,
  row: InscriptionReading,
): ChoreographyAnomaly[] {
  return readAnomalies(groupType, [row]);
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

    return {
      id: choreography.id,
      name: choreography.name,
      groupType: choreography.groupType,
      inscriptions: rows,
      depositAmount: sumBy(rows, (row) => row.depositAmount),
      totalAmount: sumBy(rows, (row) => row.totalAmount),
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
      anomalies: readAnomalies(choreography.groupType, rows),
    };
  });
}

/**
 * Who is affected by each anomaly, not just whether it fires. The alerts name
 * the inscriptions, because #551 wants the alert's *content* to do the work of
 * a conflict resolver — there is no acknowledgement to persist, so the only way
 * it helps is by saying exactly what to fix.
 */
export function readAnomalyTargets(
  groupType: string,
  rows: InscriptionReading[],
) {
  return {
    // A choreography has exactly one `groupType`, so a single inscription
    // pointing at a price of another type is enough for divergence to exist.
    groupTypeMismatch: rows.filter((row) => row.priceGroupType !== groupType),
    overAllocated: rows.filter((row) => row.excessAmount > 0),
  };
}

function readAnomalies(
  groupType: string,
  rows: InscriptionReading[],
): ChoreographyAnomaly[] {
  const targets = readAnomalyTargets(groupType, rows);

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
