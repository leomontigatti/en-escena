/**
 * El dueño único de las derivaciones de dinero de una inscripción: los tres
 * estados, las cuatro cifras y el arreglo de anomalías. Ninguna pantalla vuelve
 * a derivar un umbral ni un rollup por su cuenta.
 *
 * Todo se deriva al leer contra `Σ asignaciones`: no se escribe nada al cruzar
 * un umbral, y ninguna de estas cifras se persiste.
 */

export type InscriptionFinancialStatus =
  | "depositPending"
  | "depositMet"
  | "paidInFull";

/** El rollup de una coreografía vive en la misma escala que sus inscripciones. */
export type ChoreographyFinancialStatus = InscriptionFinancialStatus;

/**
 * Anomalías: comparaciones del estado actual, todas auto-resolutivas y
 * persistidas en ningún lado. `Sobreasignada` es la única a este nivel.
 */
export type InscriptionAnomaly = "overAllocated";

/**
 * Orden de la escala. `depositPending < depositMet < paidInFull`, que es lo que
 * hace del rollup un mínimo y no una marca de agua.
 */
const statusOrder: Record<InscriptionFinancialStatus, number> = {
  depositPending: 0,
  depositMet: 1,
  paidInFull: 2,
};

/**
 * Los dos umbrales de una inscripción. Son `null` juntos cuando no hay precio
 * aplicable: sin precio no hay umbral que cruzar, ni cifra que adeudar.
 */
export type InscriptionThresholds = {
  depositAmount: number | null;
  totalAmount: number | null;
};

/** Todo lo que una inscripción deriva de su dinero, en una sola lectura. */
export type InscriptionFinancialFigures = {
  allocatedAmount: number;
  anomalies: InscriptionAnomaly[];
  depositAmount: number | null;
  financialStatus: InscriptionFinancialStatus;
  overAllocatedAmount: number | null;
  owedBalanceAmount: number | null;
  owedDepositAmount: number | null;
  totalAmount: number | null;
};

/**
 * `Seña` de la inscripción: se computa sobre el precio **sin descontar**, para
 * que el umbral no se mueva bajo los pies de la academia cuando el
 * `Descuento por bailarín` cambia con el roster.
 */
export function calculateDepositAmount(input: {
  priceAmount: number;
  requiredDepositPercentage: number;
}) {
  return Math.round(
    (input.priceAmount * input.requiredDepositPercentage) / 100,
  );
}

/**
 * `Total` de la inscripción: el precio seleccionado menos el
 * `Descuento por bailarín` vivo, aplicado **una sola vez**. No hay coalesce
 * contra un descuento congelado ni un tercer sustraendo.
 */
export function calculateTotalAmount(input: {
  priceAmount: number;
  dancerDiscountAmount: number;
}) {
  return input.priceAmount - input.dancerDiscountAmount;
}

/**
 * El estado de una inscripción es su dinero contra sus dos umbrales, nada más.
 * Sin precio aplicable no hay umbral computable, y una inscripción no puede
 * haber cruzado un umbral que no se puede calcular: lee `depositPending`.
 */
export function deriveInscriptionFinancialStatus(input: {
  allocatedAmount: number;
  depositAmount: number | null;
  totalAmount: number | null;
}): InscriptionFinancialStatus {
  if (input.depositAmount === null || input.totalAmount === null) {
    return "depositPending";
  }

  if (input.allocatedAmount >= input.totalAmount) {
    return "paidInFull";
  }

  if (input.allocatedAmount >= input.depositAmount) {
    return "depositMet";
  }

  return "depositPending";
}

/**
 * Whether money leaving an inscription drops it **below** a threshold it had
 * crossed. It is the one reading the payment-deletion dialog counts: an
 * un-crossing never blocks anything, so all there is to do with it is state it.
 */
export function hasUncrossedThreshold(input: {
  after: InscriptionFinancialStatus;
  before: InscriptionFinancialStatus;
}): boolean {
  return statusOrder[input.after] < statusOrder[input.before];
}

/**
 * Las cuatro cifras, el estado y las anomalías de una inscripción.
 *
 * `Seña adeudada` y `Saldo adeudado` son faltantes contra cada umbral, con piso
 * en cero; como `seña ≤ total`, `Seña adeudada ≤ Saldo adeudado` siempre. Son
 * brutas: netean la inscripción contra **sus propias** asignaciones, nunca
 * contra el `Saldo disponible` de la academia.
 */
export function deriveInscriptionFinancialFigures(input: {
  allocatedAmount: number;
  thresholds: InscriptionThresholds;
}): InscriptionFinancialFigures {
  const { depositAmount, totalAmount } = input.thresholds;
  const financialStatus = deriveInscriptionFinancialStatus({
    allocatedAmount: input.allocatedAmount,
    depositAmount,
    totalAmount,
  });
  const overAllocatedAmount =
    totalAmount === null
      ? null
      : Math.max(0, input.allocatedAmount - totalAmount);

  return {
    allocatedAmount: input.allocatedAmount,
    anomalies: overAllocatedAmount ? ["overAllocated"] : [],
    depositAmount,
    financialStatus,
    overAllocatedAmount,
    owedBalanceAmount:
      totalAmount === null
        ? null
        : Math.max(0, totalAmount - input.allocatedAmount),
    owedDepositAmount:
      depositAmount === null
        ? null
        : Math.max(0, depositAmount - input.allocatedAmount),
    totalAmount,
  };
}

/**
 * El estado de una coreografía es el **mínimo** de sus inscripciones, no una
 * marca de agua: una sola inscripción sin cubrir arrastra a toda la coreografía,
 * porque el badge responde *¿puede presentarse como está coreografiada?*.
 *
 * Una coreografía sin inscripciones tampoco puede presentarse: `depositPending`.
 */
export function deriveChoreographyFinancialStatus(
  statuses: InscriptionFinancialStatus[],
): ChoreographyFinancialStatus {
  if (statuses.length === 0) {
    return "depositPending";
  }

  return statuses.reduce((lowest, status) =>
    statusOrder[status] < statusOrder[lowest] ? status : lowest,
  );
}
