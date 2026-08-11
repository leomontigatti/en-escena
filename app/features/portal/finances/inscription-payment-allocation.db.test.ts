import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  payments,
  choreographyDancers,
  paymentAllocations,
  prices,
} from "@/db/schema";
import {
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
} from "@/features/portal/choreographies/test-support/db";
import { createAcademySession } from "@/features/portal/test-support/db";
import { activateEvent } from "@/lib/events/management.server";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";
import {
  createSavedEvent,
  registerPaymentForTest,
} from "../../../lib/admin/finances/finances.test-support";

installDatabaseTestHooks();

async function createInscriptionFixture() {
  const owner = await createAcademySession({
    email: "inscripcion.schema@example.com",
    academyName: "Academia Inscripción Schema",
  });
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  await activateEvent(event.id);
  const catalog = await createEventCatalog(event.id);
  const choreography = await createChoreographyRecord({
    academyId: owner.academyId,
    categoryId: catalog.categoryWithLevel.id,
    eventId: event.id,
    experienceLevelId: catalog.level.id,
    modalityId: catalog.modality.id,
    name: "Solo inscripción",
    scheduleCapacityId: catalog.scheduleCapacity.id,
    submodalityId: catalog.submodality.id,
  });
  const dancer = await createDancer(owner.academyId, {
    firstName: "Ana",
    lastName: "Bailarina",
  });

  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    })
    .returning();

  await registerPaymentForTest({
    academyId: owner.academyId,
    amount: "10000",
    eventId: event.id,
    paymentDate: "2026-03-21",
  });
  const payment = await db.query.payments.findFirst({
    where: eq(payments.academyId, owner.academyId),
  });
  if (!payment) {
    throw new Error("Expected a registered payment.");
  }

  return { owner, event, inscription, payment };
}

describe.sequential("inscription identity and payment allocations", () => {
  test("gives inscriptions a stable id and preserves the dancer pair uniqueness", async () => {
    const { inscription } = await createInscriptionFixture();

    expect(inscription.id).toEqual(expect.any(String));
    expect(inscription.id).not.toEqual("");

    const duplicatePairError = await db
      .insert(choreographyDancers)
      .values({
        ageAtEventStart: 15,
        choreographyId: inscription.choreographyId,
        dancerId: inscription.dancerId,
      })
      .catch((error) => error);

    expect(duplicatePairError).toBeInstanceOf(Error);
  });

  test("persists one allocation per payment and inscription", async () => {
    const { owner, event, inscription, payment } =
      await createInscriptionFixture();

    await db.insert(paymentAllocations).values({
      academyId: owner.academyId,
      amount: 3000,
      eventId: event.id,
      inscriptionId: inscription.id,
      paymentId: payment.id,
    });

    // Sin tipo, el par (pago, inscripción) es único: una segunda fila del mismo
    // par no entra, por más que traiga otro monto.
    const duplicateAllocationError = await db
      .insert(paymentAllocations)
      .values({
        academyId: owner.academyId,
        amount: 6000,
        eventId: event.id,
        inscriptionId: inscription.id,
        paymentId: payment.id,
      })
      .catch((error) => error);

    expect(duplicateAllocationError).toBeInstanceOf(Error);

    // Otro pago sobre la misma inscripción sí: varios pagos pueden cubrirla.
    await registerPaymentForTest({
      academyId: owner.academyId,
      amount: "6000",
      eventId: event.id,
      paymentDate: "2026-03-22",
    });
    const secondPayment = await db.query.payments.findFirst({
      where: eq(payments.paymentNumber, 2),
    });
    if (!secondPayment) {
      throw new Error("Expected a second registered payment.");
    }

    await db.insert(paymentAllocations).values({
      academyId: owner.academyId,
      amount: 6000,
      eventId: event.id,
      inscriptionId: inscription.id,
      paymentId: secondPayment.id,
    });

    const allocations = await db.query.paymentAllocations.findMany({
      where: eq(paymentAllocations.inscriptionId, inscription.id),
    });

    expect(allocations).toHaveLength(2);
  });

  test("rejects an allocation of zero or less", async () => {
    const { owner, event, inscription, payment } =
      await createInscriptionFixture();

    const error = await db
      .insert(paymentAllocations)
      .values({
        academyId: owner.academyId,
        amount: 0,
        eventId: event.id,
        inscriptionId: inscription.id,
        paymentId: payment.id,
      })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    await expect(
      db.query.paymentAllocations.findMany({
        where: eq(paymentAllocations.inscriptionId, inscription.id),
      }),
    ).resolves.toEqual([]);
  });

  test("deleting a payment cascades its allocations", async () => {
    const { owner, event, inscription, payment } =
      await createInscriptionFixture();

    await db.insert(paymentAllocations).values({
      academyId: owner.academyId,
      amount: 3000,
      eventId: event.id,
      inscriptionId: inscription.id,
      paymentId: payment.id,
    });

    await db.delete(payments).where(eq(payments.id, payment.id));

    await expect(
      db.query.paymentAllocations.findMany({
        where: eq(paymentAllocations.inscriptionId, inscription.id),
      }),
    ).resolves.toEqual([]);
  });

  test("refuses to move the selected price of an inscription that holds money", async () => {
    const { owner, event, inscription, payment } =
      await createInscriptionFixture();

    await db.insert(paymentAllocations).values({
      academyId: owner.academyId,
      amount: 3000,
      eventId: event.id,
      inscriptionId: inscription.id,
      paymentId: payment.id,
    });

    const price = await db.query.prices.findFirst({
      where: eq(prices.eventId, event.id),
    });
    if (!price) {
      throw new Error("Expected a price row.");
    }

    const error = await db
      .update(choreographyDancers)
      .set({ selectedPriceId: price.id })
      .where(eq(choreographyDancers.id, inscription.id))
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    await expect(
      db.query.choreographyDancers.findFirst({
        where: eq(choreographyDancers.id, inscription.id),
      }),
    ).resolves.toMatchObject({ selectedPriceId: null });
  });
});
