/**
 * PROTOTIPO DESCARTABLE — ticket #550 del mapa #547.
 *
 * `Pagar seña` y `Pagar saldo` como **presets sobre las figuras** (#551), no como
 * peldaños de una escalera: cada uno mira `owedDepositAmount` u
 * `owedBalanceAmount` de las filas elegidas y arma un plan de asignaciones.
 *
 * Dos reglas que el prototipo pone a la vista porque son decisiones, no detalles:
 *
 * 1. **Nada depende del orden en que el admin hizo clic** (preferencia declarada
 *    del mapa). Las filas se recorren ordenadas por nombre y los pagos por número,
 *    así que el mismo conjunto elegido produce siempre el mismo plan.
 * 2. **Una fila sin precio elegido no puede entrar en un preset**: sin precio no
 *    hay figura contra la que medir. El preset las aparta y las cuenta, en lugar
 *    de elegirles un precio por su cuenta.
 */
import type { InscriptionReading, PaymentReading } from "./fixtures";

export type PresetKind = "deposit" | "balance";

/** Qué hacer cuando la plata elegida no alcanza para todas las filas. */
export type ShortfallPolicy = "allOrNothing" | "fillInOrder";

export type PresetSkipReason = "noPrice" | "alreadyMet";

export type PresetLine = {
  inscription: InscriptionReading;
  /** Lo que el preset pide para esta fila. */
  targetAmount: number;
  /** Lo que efectivamente se le asigna. Menor al target si la plata no alcanzó. */
  amount: number;
  /** Desglose por pago: cada tramo es un upsert `(pago, inscripción)`. */
  fundedBy: { paymentId: string; paymentNumber: number; amount: number }[];
};

export type PresetPlan = {
  kind: PresetKind;
  lines: PresetLine[];
  skipped: { inscription: InscriptionReading; reason: PresetSkipReason }[];
  /** Suma de los targets de las filas elegibles. */
  requestedAmount: number;
  /** Suma de lo que se va a asignar. */
  fundedAmount: number;
  /** `requested - funded`. Mayor a cero cuando la plata no alcanza. */
  shortfallAmount: number;
  /** Plata elegida que sobra después de aplicar el plan. */
  leftoverAmount: number;
  /**
   * `allOrNothing` con plata insuficiente: no se asigna nada y la acción queda
   * bloqueada. Se expone para que la UI explique por qué el botón no hace nada.
   */
  blockedByShortfall: boolean;
};

export function presetTargetAmount(
  inscription: InscriptionReading,
  kind: PresetKind,
) {
  return kind === "deposit"
    ? (inscription.owedDepositAmount ?? 0)
    : (inscription.owedBalanceAmount ?? 0);
}

export function buildPresetPlan({
  inscriptions,
  payments,
  kind,
  shortfallPolicy,
}: {
  inscriptions: InscriptionReading[];
  payments: PaymentReading[];
  kind: PresetKind;
  shortfallPolicy: ShortfallPolicy;
}): PresetPlan {
  const skipped: PresetPlan["skipped"] = [];
  const eligible: { inscription: InscriptionReading; targetAmount: number }[] =
    [];

  // Orden determinista por nombre: el plan no puede depender del orden de clic.
  const ordered = [...inscriptions].sort((left, right) =>
    left.dancerName.localeCompare(right.dancerName, "es-AR"),
  );

  for (const inscription of ordered) {
    if (inscription.status === null) {
      skipped.push({ inscription, reason: "noPrice" });
      continue;
    }

    const targetAmount = presetTargetAmount(inscription, kind);

    if (targetAmount === 0) {
      skipped.push({ inscription, reason: "alreadyMet" });
      continue;
    }

    eligible.push({ inscription, targetAmount });
  }

  const requestedAmount = eligible.reduce(
    (total, row) => total + row.targetAmount,
    0,
  );
  const availableAmount = payments.reduce(
    (total, payment) => total + payment.availableAmount,
    0,
  );
  const blockedByShortfall =
    shortfallPolicy === "allOrNothing" && requestedAmount > availableAmount;

  // Pagos en orden de número, no de elección, por la misma razón que las filas.
  const purse = [...payments]
    .sort((left, right) => left.number - right.number)
    .map((payment) => ({
      id: payment.id,
      number: payment.number,
      remaining: blockedByShortfall ? 0 : payment.availableAmount,
    }));

  const lines = eligible.map(({ inscription, targetAmount }) => {
    const fundedBy: PresetLine["fundedBy"] = [];
    let pending = targetAmount;

    for (const source of purse) {
      if (pending === 0 || source.remaining === 0) {
        continue;
      }

      const taken = Math.min(pending, source.remaining);
      source.remaining -= taken;
      pending -= taken;
      fundedBy.push({
        paymentId: source.id,
        paymentNumber: source.number,
        amount: taken,
      });
    }

    return {
      inscription,
      targetAmount,
      amount: targetAmount - pending,
      fundedBy,
    };
  });

  const fundedAmount = lines.reduce((total, line) => total + line.amount, 0);

  return {
    kind,
    lines,
    skipped,
    requestedAmount,
    fundedAmount,
    shortfallAmount: requestedAmount - fundedAmount,
    leftoverAmount: purse.reduce(
      (total, source) => total + source.remaining,
      0,
    ),
    blockedByShortfall,
  };
}

/**
 * El plan como upserts absolutos: `onAllocate` sobrescribe el monto de
 * `(pago, inscripción)`, así que hay que sumarle lo que esa fila ya tenía de ese
 * mismo pago.
 */
export function planUpserts(plan: PresetPlan) {
  return plan.lines.flatMap((line) =>
    line.fundedBy.map((source) => {
      const existing =
        line.inscription.allocations.find(
          (allocation) => allocation.paymentId === source.paymentId,
        )?.amount ?? 0;

      return {
        paymentId: source.paymentId,
        inscriptionId: line.inscription.id,
        amount: existing + source.amount,
      };
    }),
  );
}

export const presetLabels = {
  deposit: "Pagar seña",
  balance: "Pagar saldo",
} as const satisfies Record<PresetKind, string>;

export const skipReasonLabels = {
  noPrice: "sin precio elegido",
  alreadyMet: "ya cubierta",
} as const satisfies Record<PresetSkipReason, string>;
