import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographyDancers, paymentAllocations, payments } from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import { applyAllocationDelta } from "@/lib/finances/choreography-cobro-allocations.server";
import {
  createAcademyFinanceChoreographyFixture,
  createSavedEvent,
  registerPaymentForTest,
} from "@/lib/admin/finances/finances.test-support";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

async function seedAllocationFixture() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: "Academia Asignaciones",
      email: `asignaciones.${crypto.randomUUID()}@example.com`,
      choreographyName: "Coreografía asignaciones",
      event,
    });
  const dancer = await createDancer(academy.academy.id);
  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    })
    .returning();

  await registerPaymentForTest({
    academyId: academy.academy.id,
    amount: "10000",
    eventId: event.id,
    paymentDate: "2026-03-21",
  });
  const payment = await db.query.payments.findFirst({
    where: eq(payments.academyId, academy.academy.id),
  });
  if (!payment) {
    throw new Error("Expected a registered payment.");
  }

  return {
    academyId: academy.academy.id,
    eventId: event.id,
    inscriptionId: inscription.id,
    paymentId: payment.id,
  };
}

async function readAllocations(inscriptionId: string) {
  return await db.query.paymentAllocations.findMany({
    where: eq(paymentAllocations.inscriptionId, inscriptionId),
  });
}

describe.sequential("applyAllocationDelta", () => {
  test("suma sobre la fila del par en vez de crear una segunda", async () => {
    const fixture = await seedAllocationFixture();

    await applyAllocationDelta(db, { ...fixture, delta: 3000 });
    await applyAllocationDelta(db, { ...fixture, delta: 4000 });

    const allocations = await readAllocations(fixture.inscriptionId);
    expect(allocations).toHaveLength(1);
    expect(allocations[0]?.amount).toBe(7000);
  });

  test("borra la fila cuando el decremento la deja en cero", async () => {
    const fixture = await seedAllocationFixture();

    await applyAllocationDelta(db, { ...fixture, delta: 3000 });
    await applyAllocationDelta(db, { ...fixture, delta: -1000 });

    expect(await readAllocations(fixture.inscriptionId)).toMatchObject([
      { amount: 2000 },
    ]);

    await applyAllocationDelta(db, { ...fixture, delta: -2000 });

    // No row survives at zero: the positive-amount CHECK would not allow it.
    expect(await readAllocations(fixture.inscriptionId)).toEqual([]);
  });
});
