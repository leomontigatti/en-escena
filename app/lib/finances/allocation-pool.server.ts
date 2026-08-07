/**
 * Las dos mitades de un mismo invariante: `spreadFromPool` financia una
 * inscripción desde el `Saldo disponible` de la academia y `unwindToPool` la
 * desfinancia. Viven juntas porque una no se puede cambiar sin la otra.
 *
 * ## El invariante
 *
 * ```
 * Saldo disponible = Σ pagos − Σ asignaciones − Σ reintegros ≥ 0
 * ```
 *
 * El piso en cero es **estructural, no un clamp**: toda asignación se acota
 * contra lo que queda libre en los pagos, y el `amount` de un pago se escribe
 * una sola vez. No hay ninguna resta que pueda pasarse: si no hay pool, la
 * escritura se rechaza antes de tocar una fila.
 *
 * El término de reintegros está en el invariante porque es parte de la regla,
 * pero **todavía no existe**: no hay tabla ni columna de reintegros, y hasta que
 * #536 la agregue el `Saldo disponible` se lee como `Σ pagos − Σ asignaciones`.
 *
 * ## Las dos direcciones
 *
 * Financiar consume los pagos de la academia **del más viejo al más nuevo por
 * número de pago**; desfinanciar consume las asignaciones de la inscripción **de
 * la más nueva a la más vieja por número de pago**, decrementando y borrando la
 * fila en cero. Financiar un monto y deshacerlo enseguida devuelve las filas a
 * su estado anterior.
 *
 * El ida y vuelta es exacto mientras lo que se deshace sea lo último que se
 * financió. Si entre medio se libera plata en un pago más viejo que uno donde la
 * inscripción ya tenía asignado, el total vuelve igual pero puede repartirse
 * distinto entre pagos: la plata es fungible y no se guarda de dónde vino, que
 * es justamente lo que evita reintroducir un orden de reversión.
 *
 * ## El costo aceptado
 *
 * El administrador ya no puede levantar **un pago concreto** de **una
 * inscripción concreta**: nombra una inscripción y un monto, nunca un pago. Si
 * un pago se registró por error, el remedio es borrar el pago.
 */

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { paymentAllocations, payments } from "@/db/schema";
import { deriveInscriptionFinancialFigures } from "@/lib/finances/inscription-financial-status";
import { readInscriptionThresholds } from "@/lib/finances/inscription-thresholds.server";

import { applyAllocationDelta } from "./choreography-cobro-allocations.server";
import type {
  CobroResult,
  Transaction,
} from "./choreography-cobro-support.server";

type Executor = Transaction | typeof db;

/**
 * Financia una inscripción con plata del `Saldo disponible` de la academia.
 *
 * Consume los pagos del más viejo al más nuevo por número de pago, creando o
 * incrementando la fila `(pago, inscripción)` hasta cubrir el monto. Rechaza dos
 * cosas, ninguna con override:
 *
 * - **Sobreasignación activa**: lo que quedaría asignado no puede superar el
 *   `Total` de la inscripción. Por eso lo adeudado se computa acá, en la
 *   escritura, y no sólo al leer.
 * - **Pool insuficiente**: no se asigna plata que la academia no pagó.
 *
 * La sobreasignación **pasiva** —la que ya estaba registrada— no se toca: esta
 * función no la corrige ni la borra, sólo se niega a agrandarla.
 */
export async function spreadFromPool(
  tx: Executor,
  input: {
    academyId: string;
    amount: number;
    eventId: string;
    inscriptionId: string;
  },
): Promise<CobroResult> {
  if (input.amount <= 0) {
    return {
      ok: false,
      message: "El monto a asignar tiene que ser mayor a 0.",
    };
  }

  const refusal = await assertNoActiveOverAllocation(tx, input);
  if (!refusal.ok) {
    return refusal;
  }

  const pool = await readPoolAvailability(tx, {
    academyId: input.academyId,
    eventId: input.eventId,
  });
  const availableAmount = pool.reduce(
    (sum, entry) => sum + entry.availableAmount,
    0,
  );

  if (availableAmount < input.amount) {
    return {
      ok: false,
      message: "La academia no tiene saldo disponible suficiente.",
    };
  }

  let remaining = input.amount;

  for (const entry of pool) {
    if (remaining === 0) {
      break;
    }

    const delta = Math.min(remaining, entry.availableAmount);

    if (delta === 0) {
      continue;
    }

    await applyAllocationDelta(tx, {
      academyId: input.academyId,
      delta,
      eventId: input.eventId,
      inscriptionId: input.inscriptionId,
      paymentId: entry.paymentId,
    });

    remaining -= delta;
  }

  return { ok: true };
}

/**
 * Devuelve plata de una inscripción al `Saldo disponible` de la academia: el
 * inverso exacto de `spreadFromPool`.
 *
 * Consume las asignaciones de la inscripción de la más nueva a la más vieja por
 * número de pago, decrementando y borrando la fila cuando llega a cero. No se
 * puede sacar más de lo que la inscripción tiene asignado; sacar todo la deja
 * sin ninguna fila.
 */
export async function unwindToPool(
  tx: Executor,
  input: {
    academyId: string;
    amount: number;
    eventId: string;
    inscriptionId: string;
  },
): Promise<CobroResult> {
  if (input.amount <= 0) {
    return { ok: false, message: "El monto a quitar tiene que ser mayor a 0." };
  }

  const allocations = await readInscriptionAllocations(tx, input.inscriptionId);
  const allocatedAmount = allocations.reduce(
    (sum, allocation) => sum + allocation.amount,
    0,
  );

  if (allocatedAmount < input.amount) {
    return {
      ok: false,
      message: "La inscripción no tiene esa plata asignada.",
    };
  }

  let remaining = input.amount;

  for (const allocation of allocations) {
    if (remaining === 0) {
      break;
    }

    const delta = Math.min(remaining, allocation.amount);

    await applyAllocationDelta(tx, {
      academyId: input.academyId,
      delta: -delta,
      eventId: input.eventId,
      inscriptionId: input.inscriptionId,
      paymentId: allocation.paymentId,
    });

    remaining -= delta;
  }

  return { ok: true };
}

/**
 * Lo que la inscripción tiene asignado hoy. Lo consumen la comprobación de
 * sobreasignación y las presets de cobro, que asignan exactamente lo adeudado.
 */
export async function readInscriptionAllocatedAmount(
  tx: Executor,
  inscriptionId: string,
): Promise<number> {
  const allocations = await readInscriptionAllocations(tx, inscriptionId);

  return allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
}

/**
 * Rechazo de la sobreasignación activa. Computa lo adeudado en la escritura con
 * el mismo dueño que la lectura (`deriveInscriptionFinancialFigures` sobre los
 * umbrales resueltos), para que la escritura no pueda discrepar de lo que la
 * pantalla muestra.
 */
async function assertNoActiveOverAllocation(
  tx: Executor,
  input: {
    academyId: string;
    amount: number;
    eventId: string;
    inscriptionId: string;
  },
): Promise<CobroResult> {
  const thresholds = await readInscriptionThresholds(tx, {
    academyId: input.academyId,
    eventId: input.eventId,
    inscriptionIds: [input.inscriptionId],
  });
  const inscriptionThresholds = thresholds.get(input.inscriptionId);

  if (!inscriptionThresholds) {
    return { ok: false, message: "No encontramos esa inscripción." };
  }

  const figures = deriveInscriptionFinancialFigures({
    allocatedAmount: await readInscriptionAllocatedAmount(
      tx,
      input.inscriptionId,
    ),
    thresholds: inscriptionThresholds,
  });

  if (figures.owedBalanceAmount === null) {
    return {
      ok: false,
      message:
        "No hay un precio configurado para esta inscripción, así que no se puede saber cuánto debe.",
    };
  }

  if (input.amount > figures.owedBalanceAmount) {
    return {
      ok: false,
      message: `No se puede asignar más de lo que la inscripción adeuda (${figures.owedBalanceAmount}).`,
    };
  }

  return { ok: true };
}

/**
 * Los pagos de la academia en el evento con lo que les queda libre, del más
 * viejo al más nuevo por número de pago. Es el pool: la suma de estos
 * disponibles es el `Saldo disponible` de la academia.
 */
async function readPoolAvailability(
  tx: Executor,
  input: { academyId: string; eventId: string },
): Promise<Array<{ availableAmount: number; paymentId: string }>> {
  const paymentRows = await tx
    .select({
      amount: payments.amount,
      id: payments.id,
    })
    .from(payments)
    .where(
      and(
        eq(payments.academyId, input.academyId),
        eq(payments.eventId, input.eventId),
      ),
    )
    .orderBy(asc(payments.paymentNumber));

  const allocationRows = await tx
    .select({
      amount: paymentAllocations.amount,
      paymentId: paymentAllocations.paymentId,
    })
    .from(paymentAllocations)
    .where(
      and(
        eq(paymentAllocations.academyId, input.academyId),
        eq(paymentAllocations.eventId, input.eventId),
      ),
    );

  const allocatedByPayment = new Map<string, number>();
  for (const allocation of allocationRows) {
    allocatedByPayment.set(
      allocation.paymentId,
      (allocatedByPayment.get(allocation.paymentId) ?? 0) + allocation.amount,
    );
  }

  return paymentRows.map((payment) => ({
    availableAmount: Math.max(
      0,
      payment.amount - (allocatedByPayment.get(payment.id) ?? 0),
    ),
    paymentId: payment.id,
  }));
}

/**
 * Las asignaciones de una inscripción, de la más nueva a la más vieja por número
 * de pago: el orden en que se deshacen.
 */
async function readInscriptionAllocations(
  tx: Executor,
  inscriptionId: string,
): Promise<Array<{ amount: number; paymentId: string }>> {
  return await tx
    .select({
      amount: paymentAllocations.amount,
      paymentId: paymentAllocations.paymentId,
    })
    .from(paymentAllocations)
    .innerJoin(payments, eq(paymentAllocations.paymentId, payments.id))
    .where(eq(paymentAllocations.inscriptionId, inscriptionId))
    .orderBy(desc(payments.paymentNumber));
}
