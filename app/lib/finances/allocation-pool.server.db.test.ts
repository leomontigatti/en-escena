import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { choreographyDancers, paymentAllocations, payments } from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import {
  spreadFromPool,
  unwindToPool,
} from "@/lib/finances/allocation-pool.server";
import * as businessTimeZone from "@/lib/shared/business-time-zone";

import { installDatabaseTestHooks } from "../../../tests/db/harness";
import {
  createAcademyFinanceChoreographyFixture,
  createSavedEvent,
  registerPaymentForTest,
} from "../admin/finances/finances.test-support";

installDatabaseTestHooks();

beforeEach(() => {
  vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
    "2026-04-10",
  );
});

/**
 * Una inscripción `solo` con precio del catálogo (10000) y tres pagos de la
 * academia, numerados 1, 2 y 3. El pool arranca entero: nada asignado.
 */
async function seedPoolFixture(paymentAmounts: number[] = [1000, 2000, 3000]) {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: "Academia Pool",
      email: `pool.${crypto.randomUUID()}@example.com`,
      choreographyName: "Pool coreografía",
      event,
    });
  const dancer = await createDancer(academy.academy.id, {
    firstName: "Ana",
    lastName: "Alonso",
  });

  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    })
    .returning();

  if (!inscription) {
    throw new Error("Expected an inscription.");
  }

  for (const [index, amount] of paymentAmounts.entries()) {
    await registerPaymentForTest({
      academyId: academy.academy.id,
      amount: String(amount),
      eventId: event.id,
      paymentDate: `2026-04-0${index + 1}`,
    });
  }

  const paymentRows = await db
    .select({ id: payments.id, paymentNumber: payments.paymentNumber })
    .from(payments)
    .where(eq(payments.academyId, academy.academy.id))
    .orderBy(asc(payments.paymentNumber));

  return {
    academyId: academy.academy.id,
    eventId: event.id,
    inscriptionId: inscription.id,
    paymentRows,
  };
}

/**
 * Las asignaciones de una inscripción por número de pago, que es la forma en la
 * que se comparan dos estados de las filas.
 */
async function readAllocationsByPaymentNumber(inscriptionId: string) {
  const rows = await db
    .select({
      amount: paymentAllocations.amount,
      paymentNumber: payments.paymentNumber,
    })
    .from(paymentAllocations)
    .innerJoin(payments, eq(paymentAllocations.paymentId, payments.id))
    .where(eq(paymentAllocations.inscriptionId, inscriptionId))
    .orderBy(asc(payments.paymentNumber));

  return rows;
}

describe.sequential("the pool funding rule and its inverse", () => {
  test("funds oldest-first by payment number, filling each payment before the next", async () => {
    const fixture = await seedPoolFixture([1000, 2000, 3000]);

    const result = await spreadFromPool(db, {
      academyId: fixture.academyId,
      amount: 2500,
      eventId: fixture.eventId,
      inscriptionId: fixture.inscriptionId,
    });

    expect(result).toEqual({ ok: true });
    // 1000 del pago 1 (entero) y 1500 del pago 2; el pago 3 no se toca.
    expect(await readAllocationsByPaymentNumber(fixture.inscriptionId)).toEqual(
      [
        { amount: 1000, paymentNumber: 1 },
        { amount: 1500, paymentNumber: 2 },
      ],
    );
  });

  test("unwinds newest-first by payment number, deleting the row at zero", async () => {
    const fixture = await seedPoolFixture([1000, 2000, 3000]);

    await spreadFromPool(db, {
      academyId: fixture.academyId,
      amount: 2500,
      eventId: fixture.eventId,
      inscriptionId: fixture.inscriptionId,
    });
    const result = await unwindToPool(db, {
      academyId: fixture.academyId,
      amount: 2000,
      eventId: fixture.eventId,
      inscriptionId: fixture.inscriptionId,
    });

    expect(result).toEqual({ ok: true });
    // Se consume primero el pago 2 (1500, la fila desaparece) y el resto sale
    // del pago 1.
    expect(await readAllocationsByPaymentNumber(fixture.inscriptionId)).toEqual(
      [{ amount: 500, paymentNumber: 1 }],
    );
  });

  test("allocating and then deallocating the same amount leaves the rows identical", async () => {
    const fixture = await seedPoolFixture([1000, 2000, 3000]);

    await spreadFromPool(db, {
      academyId: fixture.academyId,
      amount: 1200,
      eventId: fixture.eventId,
      inscriptionId: fixture.inscriptionId,
    });
    const before = await readAllocationsByPaymentNumber(fixture.inscriptionId);

    await spreadFromPool(db, {
      academyId: fixture.academyId,
      amount: 1800,
      eventId: fixture.eventId,
      inscriptionId: fixture.inscriptionId,
    });
    await unwindToPool(db, {
      academyId: fixture.academyId,
      amount: 1800,
      eventId: fixture.eventId,
      inscriptionId: fixture.inscriptionId,
    });

    expect(await readAllocationsByPaymentNumber(fixture.inscriptionId)).toEqual(
      before,
    );
  });

  test("a full round trip from nothing leaves no allocation rows behind", async () => {
    const fixture = await seedPoolFixture([1000, 2000, 3000]);

    await spreadFromPool(db, {
      academyId: fixture.academyId,
      amount: 3000,
      eventId: fixture.eventId,
      inscriptionId: fixture.inscriptionId,
    });
    await unwindToPool(db, {
      academyId: fixture.academyId,
      amount: 3000,
      eventId: fixture.eventId,
      inscriptionId: fixture.inscriptionId,
    });

    expect(await readAllocationsByPaymentNumber(fixture.inscriptionId)).toEqual(
      [],
    );
  });

  test("refuses to allocate more than the inscription owes, with nothing written", async () => {
    const fixture = await seedPoolFixture([20000]);

    const result = await spreadFromPool(db, {
      academyId: fixture.academyId,
      amount: 10001,
      eventId: fixture.eventId,
      inscriptionId: fixture.inscriptionId,
    });

    expect(result).toMatchObject({ ok: false });
    expect(await readAllocationsByPaymentNumber(fixture.inscriptionId)).toEqual(
      [],
    );
  });

  test("refuses to allocate more than the academy's available balance", async () => {
    const fixture = await seedPoolFixture([1000, 2000]);

    const result = await spreadFromPool(db, {
      academyId: fixture.academyId,
      amount: 3001,
      eventId: fixture.eventId,
      inscriptionId: fixture.inscriptionId,
    });

    expect(result).toMatchObject({ ok: false });
    expect(await readAllocationsByPaymentNumber(fixture.inscriptionId)).toEqual(
      [],
    );
  });

  test("leaves a passive over-allocation where it sits and only refuses to grow it", async () => {
    const fixture = await seedPoolFixture([20000]);
    const [payment] = fixture.paymentRows;

    if (!payment) {
      throw new Error("Expected a payment.");
    }

    // Sobreasignación pasiva: 12000 contra un total de 10000, escrita sin pasar
    // por el pool (es lo que ya hay en producción).
    await db.insert(paymentAllocations).values({
      academyId: fixture.academyId,
      amount: 12000,
      eventId: fixture.eventId,
      inscriptionId: fixture.inscriptionId,
      paymentId: payment.id,
    });

    const result = await spreadFromPool(db, {
      academyId: fixture.academyId,
      amount: 1,
      eventId: fixture.eventId,
      inscriptionId: fixture.inscriptionId,
    });

    expect(result).toMatchObject({ ok: false });
    // El excedente sigue donde estaba: nadie lo corrigió ni lo borró.
    expect(await readAllocationsByPaymentNumber(fixture.inscriptionId)).toEqual(
      [{ amount: 12000, paymentNumber: 1 }],
    );
  });

  test("refuses to unwind more than the inscription has allocated", async () => {
    const fixture = await seedPoolFixture([1000, 2000]);

    await spreadFromPool(db, {
      academyId: fixture.academyId,
      amount: 1000,
      eventId: fixture.eventId,
      inscriptionId: fixture.inscriptionId,
    });
    const result = await unwindToPool(db, {
      academyId: fixture.academyId,
      amount: 1001,
      eventId: fixture.eventId,
      inscriptionId: fixture.inscriptionId,
    });

    expect(result).toMatchObject({ ok: false });
    expect(await readAllocationsByPaymentNumber(fixture.inscriptionId)).toEqual(
      [{ amount: 1000, paymentNumber: 1 }],
    );
  });
});
