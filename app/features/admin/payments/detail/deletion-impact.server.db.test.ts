import { asc, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  paymentAllocations,
  payments,
  prices,
} from "@/db/schema";
import { readPaymentDeletionImpact } from "@/features/admin/payments/detail/deletion-impact.server";
import {
  createChoreographyRecord,
  createDancer,
} from "@/features/portal/choreographies/test-support/db";
import { spreadFromPool } from "@/lib/finances/allocation-pool.server";
import {
  deriveChoreographyFinancialStatus,
  deriveInscriptionFinancialStatus,
} from "@/lib/finances/inscription-financial-status";
import { readInscriptionThresholds } from "@/lib/finances/inscription-thresholds.server";
import * as businessTimeZone from "@/lib/shared/business-time-zone";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";
import {
  createAcademyFinanceChoreographyFixture,
  createSavedEvent,
  registerPaymentForTest,
} from "@/lib/admin/finances/finances.test-support";

installDatabaseTestHooks();

beforeEach(() => {
  vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
    "2026-04-10",
  );
});

/**
 * Two `solo` choreographies, one inscription each, at the catalogue price of
 * 10000 with a 30 % deposit, funded by two payments. One payment is the one
 * about to be deleted.
 */
async function seedDeletionFixture() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, catalog, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: "Academia Borrado",
      email: `deletion.${crypto.randomUUID()}@example.com`,
      choreographyName: "Aire",
      event,
    });
  const second = await createChoreographyRecord({
    academyId: academy.academy.id,
    categoryId: catalog.categoryWithLevel.id,
    eventId: event.id,
    experienceLevelId: catalog.level.id,
    modalityId: catalog.modality.id,
    name: "Tango",
    scheduleCapacityId: catalog.scheduleCapacity.id,
    submodalityId: catalog.submodality.id,
  });

  const [price] = await db
    .select({ id: prices.id })
    .from(prices)
    .where(eq(prices.eventId, event.id));

  const inscriptionIds: string[] = [];
  for (const [index, target] of [choreography, second].entries()) {
    const dancer = await createDancer(academy.academy.id, {
      firstName: `Bailarín ${index}`,
      lastName: "Borrado",
    });
    const [inscription] = await db
      .insert(choreographyDancers)
      .values({
        ageAtEventStart: 14,
        choreographyId: target.id,
        dancerId: dancer.id,
        selectedPriceId: price.id,
      })
      .returning();

    if (!inscription) {
      throw new Error("Expected an inscription.");
    }

    inscriptionIds.push(inscription.id);
  }

  for (const [index, amount] of [3000, 7000].entries()) {
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
    choreographyIds: [choreography.id, second.id],
    eventId: event.id,
    inscriptionIds,
    paymentRows,
  };
}

/**
 * The statuses the choreographies actually read, from what is allocated right
 * now. Deliberately re-derived rather than taken from the impact reading: it is
 * the second opinion the dialog's claim has to survive.
 */
async function readChoreographyStatuses(input: {
  academyId: string;
  choreographyIds: string[];
  eventId: string;
}) {
  const inscriptions = await db
    .select({
      choreographyId: choreographyDancers.choreographyId,
      id: choreographyDancers.id,
    })
    .from(choreographyDancers)
    .where(inArray(choreographyDancers.choreographyId, input.choreographyIds));
  const allocations = await db
    .select({
      amount: paymentAllocations.amount,
      inscriptionId: paymentAllocations.inscriptionId,
    })
    .from(paymentAllocations)
    .where(
      inArray(
        paymentAllocations.inscriptionId,
        inscriptions.map((inscription) => inscription.id),
      ),
    );
  const thresholds = await readInscriptionThresholds(db, {
    academyId: input.academyId,
    eventId: input.eventId,
    inscriptionIds: inscriptions.map((inscription) => inscription.id),
  });

  const allocatedByInscription = new Map<string, number>();
  for (const allocation of allocations) {
    allocatedByInscription.set(
      allocation.inscriptionId,
      (allocatedByInscription.get(allocation.inscriptionId) ?? 0) +
        allocation.amount,
    );
  }

  return new Map(
    input.choreographyIds.map((choreographyId) => [
      choreographyId,
      deriveChoreographyFinancialStatus(
        inscriptions
          .filter(
            (inscription) => inscription.choreographyId === choreographyId,
          )
          .map((inscription) => {
            const resolved = thresholds.get(inscription.id);

            return deriveInscriptionFinancialStatus({
              allocatedAmount: allocatedByInscription.get(inscription.id) ?? 0,
              depositAmount: resolved?.depositAmount ?? null,
              totalAmount: resolved?.totalAmount ?? null,
            });
          }),
      ),
    ]),
  );
}

describe("readPaymentDeletionImpact", () => {
  test("names each choreography with its amount and the un-cross count the deletion produces", async () => {
    const fixture = await seedDeletionFixture();
    const doomedPayment = fixture.paymentRows[0];

    // La primera inscripción cruza la seña agotando el pago #1; la segunda se
    // la lleva entera del #2, así que borrar el #1 no la toca.
    await spreadFromPool(db, {
      academyId: fixture.academyId,
      amount: 3000,
      eventId: fixture.eventId,
      inscriptionId: fixture.inscriptionIds[0],
    });
    await spreadFromPool(db, {
      academyId: fixture.academyId,
      amount: 3000,
      eventId: fixture.eventId,
      inscriptionId: fixture.inscriptionIds[1],
    });

    const impact = await readPaymentDeletionImpact({
      academyId: fixture.academyId,
      eventId: fixture.eventId,
      paymentId: doomedPayment.id,
    });

    expect(impact).toEqual([
      {
        allocatedAmount: 3000,
        id: fixture.choreographyIds[0],
        name: "Aire",
        resultingStatus: "depositPending",
        uncrossingInscriptionCount: 1,
      },
    ]);

    await db.delete(payments).where(eq(payments.id, doomedPayment.id));

    const statuses = await readChoreographyStatuses({
      academyId: fixture.academyId,
      choreographyIds: fixture.choreographyIds,
      eventId: fixture.eventId,
    });

    // Lo que el diálogo prometió es lo que la eliminación hizo.
    expect(statuses.get(fixture.choreographyIds[0])).toBe("depositPending");
    expect(statuses.get(fixture.choreographyIds[1])).toBe("depositMet");
  });

  test("names no resulting status when nothing un-crosses", async () => {
    const fixture = await seedDeletionFixture();
    const doomedPayment = fixture.paymentRows[0];

    // 1000 sobre una seña de 3000: la inscripción sigue en `Seña pendiente`
    // antes y después, así que no hay umbral que se descruce.
    await spreadFromPool(db, {
      academyId: fixture.academyId,
      amount: 1000,
      eventId: fixture.eventId,
      inscriptionId: fixture.inscriptionIds[0],
    });

    const impact = await readPaymentDeletionImpact({
      academyId: fixture.academyId,
      eventId: fixture.eventId,
      paymentId: doomedPayment.id,
    });

    expect(impact).toEqual([
      {
        allocatedAmount: 1000,
        id: fixture.choreographyIds[0],
        name: "Aire",
        resultingStatus: null,
        uncrossingInscriptionCount: 0,
      },
    ]);
  });

  test("reads nothing for a payment with no allocations", async () => {
    const fixture = await seedDeletionFixture();

    expect(
      await readPaymentDeletionImpact({
        academyId: fixture.academyId,
        eventId: fixture.eventId,
        paymentId: fixture.paymentRows[0].id,
      }),
    ).toEqual([]);
  });
});
