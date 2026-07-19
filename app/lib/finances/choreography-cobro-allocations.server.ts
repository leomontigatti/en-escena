import { eq } from "drizzle-orm";

import { db } from "@/db";
import { payments, choreographyDancers, paymentAllocations } from "@/db/schema";
import { deriveInscriptionFinancialState } from "@/lib/finances/operational-summary-calculations.server";

import {
  clearBalanceSnapshot,
  clearDepositSnapshot,
  type CobroResult,
  type Transaction,
} from "./choreography-cobro-support.server";

type AllocationType =
  (typeof paymentAllocations.$inferSelect)["allocationType"];

/**
 * Borra una asignación de pago y limpia el snapshot correspondiente, devolviendo
 * la inscripción al estado anterior: borrar la `deposit` la deja `impaga`;
 * borrar la `balance` la deja `señada`. El monto liberado vuelve al `Saldo
 * disponible` de la academia (derivado de pagos − asignaciones).
 */
export async function deletePaymentAllocation(input: {
  allocationId: string;
}): Promise<CobroResult> {
  return await db.transaction((tx) =>
    deletePaymentAllocationWithinTx(tx, input.allocationId),
  );
}

/**
 * Núcleo de `deletePaymentAllocation` que participa de una transacción externa:
 * revierte el snapshot de la inscripción y borra la asignación. Respeta el guard
 * de orden (no se puede borrar la `deposit` de una inscripción `pagada` sin
 * borrar antes su `balance`). Reutilizado por la cascada al eliminar un pago.
 */
async function deletePaymentAllocationWithinTx(
  tx: Transaction,
  allocationId: string,
): Promise<CobroResult> {
  const allocation = await tx.query.paymentAllocations.findFirst({
    where: eq(paymentAllocations.id, allocationId),
  });

  if (!allocation) {
    return { ok: false, message: "No encontramos esa asignación." };
  }

  const inscription = await tx.query.choreographyDancers.findFirst({
    where: eq(choreographyDancers.id, allocation.inscriptionId),
  });

  if (!inscription) {
    return { ok: false, message: "No encontramos esa inscripción." };
  }

  if (allocation.allocationType === "deposit") {
    if (deriveInscriptionFinancialState(inscription) === "pagada") {
      return {
        ok: false,
        message: DEPOSIT_BEFORE_BALANCE_MESSAGE,
      };
    }

    await tx
      .update(choreographyDancers)
      .set(clearDepositSnapshot())
      .where(eq(choreographyDancers.id, inscription.id));
  } else {
    await tx
      .update(choreographyDancers)
      .set(clearBalanceSnapshot())
      .where(eq(choreographyDancers.id, inscription.id));
  }

  await tx
    .delete(paymentAllocations)
    .where(eq(paymentAllocations.id, allocation.id));

  return { ok: true };
}

/**
 * Elimina un pago arrastrando en cascada todas sus asignaciones, dentro de una
 * sola transacción. Revierte el snapshot de cada inscripción reusando la lógica
 * de `deletePaymentAllocation`. Las asignaciones de `balance` se borran antes
 * que las de `deposit` para que el guard de orden pase en el caso común (seña y
 * saldo en el mismo pago). Si alguna inscripción queda con el saldo pagado en
 * otro pago, el guard bloquea, se hace rollback total y se informa.
 */
export async function deletePaymentWithAllocations(input: {
  paymentId: string;
}): Promise<CobroResult> {
  try {
    await db.transaction(async (tx) => {
      const allocations = await tx.query.paymentAllocations.findMany({
        where: eq(paymentAllocations.paymentId, input.paymentId),
      });

      // `balance` antes que `deposit`: así, cuando ambos están en este pago, al
      // llegar a la seña la inscripción ya no está `pagada` y el guard pasa.
      const ordered = [...allocations].sort(
        (a, b) =>
          allocationDeletionRank(a.allocationType) -
          allocationDeletionRank(b.allocationType),
      );

      for (const allocation of ordered) {
        const result = await deletePaymentAllocationWithinTx(tx, allocation.id);
        if (!result.ok) {
          // El guard de orden significa que el saldo vive en otro pago: se
          // traduce a un mensaje a nivel pago. Cualquier otra causa se propaga
          // tal cual para no ocultar el error real.
          throw new PaymentCascadeBlockedError(
            result.message === DEPOSIT_BEFORE_BALANCE_MESSAGE
              ? "No se pudo eliminar el pago: hay coreografías con el saldo pagado en otro pago. Desasigná ese saldo primero."
              : result.message,
          );
        }
      }

      await tx.delete(payments).where(eq(payments.id, input.paymentId));
    });

    return { ok: true };
  } catch (error) {
    if (error instanceof PaymentCascadeBlockedError) {
      return { ok: false, message: error.message };
    }

    throw error;
  }
}

function allocationDeletionRank(allocationType: AllocationType): number {
  return allocationType === "balance" ? 0 : 1;
}

const DEPOSIT_BEFORE_BALANCE_MESSAGE =
  "Borrá primero la asignación de saldo antes de la de seña.";

class PaymentCascadeBlockedError extends Error {}

/**
 * Devuelve al `Saldo disponible` de la academia todo lo asignado a una
 * inscripción: borra sus asignaciones de pago (seña y, si existía, saldo) y
 * limpia sus snapshots. Helper consumido al quitar una inscripción del roster.
 * Acepta una transacción externa para participar del borrado del roster.
 */
export async function releaseInscriptionAllocations(
  input: { inscriptionId: string },
  tx: Transaction | typeof db = db,
): Promise<{ releasedAmount: number }> {
  const allocations = await tx.query.paymentAllocations.findMany({
    where: eq(paymentAllocations.inscriptionId, input.inscriptionId),
  });

  const releasedAmount = allocations.reduce(
    (sum, allocation) => sum + allocation.amount,
    0,
  );

  await tx
    .delete(paymentAllocations)
    .where(eq(paymentAllocations.inscriptionId, input.inscriptionId));

  await tx
    .update(choreographyDancers)
    .set({ ...clearDepositSnapshot(), ...clearBalanceSnapshot() })
    .where(eq(choreographyDancers.id, input.inscriptionId));

  return { releasedAmount };
}
