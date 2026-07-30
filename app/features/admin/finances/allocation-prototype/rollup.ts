/**
 * PROTOTIPO DESCARTABLE — ticket #550 del mapa #547.
 *
 * Rollup por coreografía y por academia con la forma que fijó #551: figuras
 * propias de cada alcance, estado como **mínimo** de las inscripciones (no
 * high-water-mark) y anomalías como **array derivado**, todas autolimpiantes —
 * nada se persiste ni se reconoce.
 */
import type {
  InscriptionFinancialStatus,
  InscriptionReading,
  PrototypeState,
} from "./fixtures";

/** Anomalías de #551. `orphanedAllocations` es plata sin precio contra el cual medirla. */
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
   * Mínimo de los estados de las inscripciones con precio elegido. `null` sólo
   * si ninguna lo eligió todavía.
   */
  status: InscriptionFinancialStatus | null;
  /**
   * Alguna inscripción sin precio elegido: las figuras se leen como tentativas
   * y se muestran atenuadas, porque todavía pueden moverse.
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
      // El mínimo se toma sobre las inscripciones que *tienen* precio: una fila
      // sin precio no es un estado, sólo vuelve tentativa la figura. `null`
      // queda para la coreografía donde ninguna eligió precio todavía.
      status:
        statuses.length === 0
          ? null
          : statuses.reduce((lowest, status) =>
              statusRank[status] < statusRank[lowest] ? status : lowest,
            ),
      tentative,
      anomalies: readAnomalies(state, choreography.groupType, rows),
    };
  });
}

function readAnomalies(
  state: PrototypeState,
  groupType: string,
  rows: InscriptionReading[],
): ChoreographyAnomaly[] {
  const anomalies: ChoreographyAnomaly[] = [];

  // Una coreografía tiene exactamente un `groupType`, así que basta con que una
  // inscripción apunte a un precio de otro tipo para que haya divergencia.
  const mismatched = rows.some((row) => {
    const price = state.prices.find(
      (candidate) => candidate.id === row.selectedPriceId,
    );
    return price !== undefined && price.groupType !== groupType;
  });

  if (mismatched) {
    anomalies.push("groupTypeMismatch");
  }

  if (rows.some((row) => row.excessAmount > 0)) {
    anomalies.push("overAllocated");
  }

  if (rows.some((row) => row.status === null && row.allocatedAmount > 0)) {
    anomalies.push("orphanedAllocations");
  }

  return anomalies;
}

export type AcademyReading = {
  depositAmount: number;
  totalAmount: number;
  owedDepositAmount: number;
  owedBalanceAmount: number;
  /** Bruto, sin descontar lo ya asignado (decisión de #549 sobre `Saldo disponible`). */
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
