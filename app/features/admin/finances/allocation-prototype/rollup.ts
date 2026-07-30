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

/** #551's anomalies. `orphanedAllocations` is money with no price to measure it against. */
export type ChoreographyAnomaly =
  | "groupTypeMismatch"
  | "overAllocated"
  | "orphanedAllocations";

export const choreographyAnomalyLabels = {
  groupTypeMismatch: "Precio de otro tipo de grupo",
  overAllocated: "Sobreasignada",
  orphanedAllocations: "Plata sin precio elegido",
} as const satisfies Record<ChoreographyAnomaly, string>;

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
  /**
   * The minimum status across inscriptions that have a price. `null` only when
   * none has chosen one yet.
   */
  status: InscriptionFinancialStatus | null;
  /**
   * Some inscription has no price chosen: the figures read as tentative and are
   * shown muted, because they can still move.
   */
  tentative: boolean;
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

    const tentative = rows.some((row) => row.status === null);
    const statuses = rows
      .map((row) => row.status)
      .filter(
        (status): status is InscriptionFinancialStatus => status !== null,
      );

    return {
      id: choreography.id,
      name: choreography.name,
      groupType: choreography.groupType,
      inscriptions: rows,
      depositAmount: sumBy(rows, (row) => row.depositAmount ?? 0),
      totalAmount: sumBy(rows, (row) => row.totalAmount ?? 0),
      allocatedAmount: sumBy(rows, (row) => row.allocatedAmount),
      owedDepositAmount: sumBy(rows, (row) => row.owedDepositAmount ?? 0),
      owedBalanceAmount: sumBy(rows, (row) => row.owedBalanceAmount ?? 0),
      // The minimum is taken over inscriptions that *have* a price: a row with
      // no price is not a status, it only makes the figure tentative. `null` is
      // left for the choreography where none has chosen a price yet.
      status:
        statuses.length === 0
          ? null
          : statuses.reduce((lowest, status) =>
              statusRank[status] < statusRank[lowest] ? status : lowest,
            ),
      tentative,
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
    groupTypeMismatch: rows.filter(
      (row) => row.priceGroupType !== null && row.priceGroupType !== groupType,
    ),
    overAllocated: rows.filter((row) => row.excessAmount > 0),
    // Structurally unreachable through this surface now: an allocation cannot be
    // written without a price, and the price clears when the last one goes. Kept
    // because data predating the rule could still show it.
    orphanedAllocations: rows.filter(
      (row) => row.status === null && row.allocatedAmount > 0,
    ),
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
