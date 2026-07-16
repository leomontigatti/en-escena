import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { payments, choreographyDancers, paymentAllocations } from "@/db/schema";
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
} from "../../../lib/admin/academies/account-current-route.test-support";

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

  test("stores nullable deposit and balance snapshot columns", async () => {
    const { inscription } = await createInscriptionFixture();

    expect(inscription.frozenBasePriceAmount).toBeNull();
    expect(inscription.depositAmount).toBeNull();
    expect(inscription.balanceAmount).toBeNull();
    expect(inscription.balanceCompletedAt).toBeNull();

    await db
      .update(choreographyDancers)
      .set({
        frozenBasePriceAmount: 10000,
        selectedPriceId: null,
        depositReferenceDate: "2026-03-21",
        depositPercentage: 30,
        depositAmount: 3000,
        balanceReferenceDate: "2026-04-21",
        appliedDancerDiscountPercentage: 10,
        appliedDancerDiscountAmount: 1000,
        finalTotalAmount: 9000,
        balanceAmount: 6000,
        balanceCompletedAt: "2026-04-21",
      })
      .where(eq(choreographyDancers.id, inscription.id));

    const reloaded = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.id, inscription.id),
    });

    expect(reloaded).toMatchObject({
      frozenBasePriceAmount: 10000,
      depositPercentage: 30,
      depositAmount: 3000,
      appliedDancerDiscountPercentage: 10,
      finalTotalAmount: 9000,
      balanceAmount: 6000,
      balanceCompletedAt: "2026-04-21",
    });
  });

  test("persists payment allocations and enforces stage uniqueness per payment", async () => {
    const { owner, event, inscription, payment } =
      await createInscriptionFixture();

    await db.insert(paymentAllocations).values({
      academyId: owner.academyId,
      allocationType: "deposit",
      amount: 3000,
      eventId: event.id,
      inscriptionId: inscription.id,
      paymentId: payment.id,
    });

    const duplicateAllocationError = await db
      .insert(paymentAllocations)
      .values({
        academyId: owner.academyId,
        allocationType: "deposit",
        amount: 3000,
        eventId: event.id,
        inscriptionId: inscription.id,
        paymentId: payment.id,
      })
      .catch((error) => error);

    expect(duplicateAllocationError).toBeInstanceOf(Error);

    await db.insert(paymentAllocations).values({
      academyId: owner.academyId,
      allocationType: "balance",
      amount: 6000,
      eventId: event.id,
      inscriptionId: inscription.id,
      paymentId: payment.id,
    });

    const allocations = await db.query.paymentAllocations.findMany({
      where: eq(paymentAllocations.inscriptionId, inscription.id),
    });

    expect(allocations).toHaveLength(2);
  });
});
