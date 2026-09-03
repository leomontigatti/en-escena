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

    // With no type, the (payment, inscription) pair is unique: a second row of the
    // same pair does not get in, whatever amount it carries.
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

    // Another payment on the same inscription does: several payments can cover it.
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

  // The catalogue price is 10000 and the event asks for 30 %, so the deposit
  // threshold of the stored row is exactly 3000. These three cases sit on either
  // side of it and on the case where there is no stored row to derive it from.
  test("refuses to move the selected price of an inscription that covers its deposit", async () => {
    const { owner, event, inscription, payment } =
      await createInscriptionFixture();
    const { catalogPrice, otherPrice } = await readPricePair(event.id);

    await db
      .update(choreographyDancers)
      .set({ selectedPriceId: catalogPrice.id })
      .where(eq(choreographyDancers.id, inscription.id));
    await db.insert(paymentAllocations).values({
      academyId: owner.academyId,
      amount: 3000,
      eventId: event.id,
      inscriptionId: inscription.id,
      paymentId: payment.id,
    });

    const error = await db
      .update(choreographyDancers)
      .set({ selectedPriceId: otherPrice.id })
      .where(eq(choreographyDancers.id, inscription.id))
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    await expect(
      db.query.choreographyDancers.findFirst({
        where: eq(choreographyDancers.id, inscription.id),
      }),
    ).resolves.toMatchObject({ selectedPriceId: catalogPrice.id });
  });

  test("lets the selected price move while the inscription is below its deposit", async () => {
    const { owner, event, inscription, payment } =
      await createInscriptionFixture();
    const { catalogPrice, otherPrice } = await readPricePair(event.id);

    await db
      .update(choreographyDancers)
      .set({ selectedPriceId: catalogPrice.id })
      .where(eq(choreographyDancers.id, inscription.id));
    // One peso short of the 3000 threshold: money on the row, nothing locked.
    await db.insert(paymentAllocations).values({
      academyId: owner.academyId,
      amount: 2999,
      eventId: event.id,
      inscriptionId: inscription.id,
      paymentId: payment.id,
    });

    await db
      .update(choreographyDancers)
      .set({ selectedPriceId: otherPrice.id })
      .where(eq(choreographyDancers.id, inscription.id));

    await expect(
      db.query.choreographyDancers.findFirst({
        where: eq(choreographyDancers.id, inscription.id),
      }),
    ).resolves.toMatchObject({ selectedPriceId: otherPrice.id });
  });

  test("locks nothing on an inscription that stores no price", async () => {
    const { owner, event, inscription, payment } =
      await createInscriptionFixture();
    const { catalogPrice } = await readPricePair(event.id);

    await db.insert(paymentAllocations).values({
      academyId: owner.academyId,
      amount: 9000,
      eventId: event.id,
      inscriptionId: inscription.id,
      paymentId: payment.id,
    });

    // No stored row is no threshold, and a threshold that cannot be computed
    // cannot have been crossed.
    await db
      .update(choreographyDancers)
      .set({ selectedPriceId: catalogPrice.id })
      .where(eq(choreographyDancers.id, inscription.id));

    await expect(
      db.query.choreographyDancers.findFirst({
        where: eq(choreographyDancers.id, inscription.id),
      }),
    ).resolves.toMatchObject({ selectedPriceId: catalogPrice.id });
  });
});

/**
 * The event's catalogue row plus a second, more expensive one to move to. Both
 * are `solo` and general, so either is a candidate for the fixture's inscription.
 */
async function readPricePair(eventId: string) {
  const catalogPrice = await db.query.prices.findFirst({
    where: eq(prices.eventId, eventId),
  });

  if (!catalogPrice) {
    throw new Error("Expected a price row.");
  }

  const [otherPrice] = await db
    .insert(prices)
    .values({
      amount: 20000,
      eventId,
      groupType: "solo",
      name: "Precio Solo tardío",
      paymentDeadline: null,
      scheduleId: null,
    })
    .returning();

  if (!otherPrice) {
    throw new Error("Expected a second price row.");
  }

  return { catalogPrice, otherPrice };
}
