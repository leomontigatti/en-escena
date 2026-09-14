import { asc, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  choreographyTarget,
  restrictedChoreographyInscriptionId,
} from "@/lib/finances/allocation-target.server";
import {
  choreographyDancers,
  paymentAllocations,
  payments,
  prices,
  seminarInscriptions,
  seminarPrices,
  seminars,
} from "@/db/schema";
import { readPaymentDeletionImpact } from "@/features/admin/payments/detail/deletion-impact.server";
import {
  createChoreographyRecord,
  createDancer,
} from "@/features/portal/choreographies/test-support/db";
import { spreadFromPool } from "@/lib/finances/allocation-pool.server";
import { allocateToSeminarInscription } from "@/lib/finances/seminar-inscription-allocation.server";
import { countCoveredSeminarInscriptions } from "@/lib/seminars/covered-inscriptions.server";
import {
  deriveMinimumFinancialStatus,
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
      inscriptionId: restrictedChoreographyInscriptionId,
    })
    .from(paymentAllocations)
    .where(
      inArray(
        paymentAllocations.choreographyInscriptionId,
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
      deriveMinimumFinancialStatus(
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

/**
 * A seminar of the same event with one inscription of the same academy, priced
 * by a non-participant `Común` row of 4000 at the seminar's own 50 %: its
 * deposit is 2000, which is what the payment about to be deleted covers.
 */
async function seedSeminarInscription(fixture: {
  academyId: string;
  eventId: string;
}) {
  const [seminar] = await db
    .insert(seminars)
    .values({
      eventId: fixture.eventId,
      instructorName: "Abril Sosa",
      quota: 5,
      requiredDepositPercentage: 50,
      scheduledDate: "2026-10-10",
      startTime: "18:30",
    })
    .returning();
  const [price] = await db
    .insert(seminarPrices)
    .values({
      amount: 4000,
      eventId: fixture.eventId,
      forParticipants: false,
      kind: "regular",
      name: "General",
      paymentDeadline: null,
    })
    .returning();
  const dancer = await createDancer(fixture.academyId, {
    firstName: "Seminarista",
    lastName: "Borrado",
  });
  const [inscription] = await db
    .insert(seminarInscriptions)
    .values({ dancerId: dancer.id, seminarId: seminar.id })
    .returning();

  return {
    inscriptionId: inscription.id,
    priceId: price.id,
    seminarId: seminar.id,
  };
}

describe("readPaymentDeletionImpact", () => {
  test("names each choreography with its amount and the un-cross count the deletion produces", async () => {
    const fixture = await seedDeletionFixture();
    const doomedPayment = fixture.paymentRows[0];

    // The first inscription crosses the deposit, exhausting payment #1; the second
    // takes all of #2, so deleting #1 does not touch it.
    await spreadFromPool(db, {
      academyId: fixture.academyId,
      amount: 3000,
      eventId: fixture.eventId,
      target: choreographyTarget(fixture.inscriptionIds[0]),
    });
    await spreadFromPool(db, {
      academyId: fixture.academyId,
      amount: 3000,
      eventId: fixture.eventId,
      target: choreographyTarget(fixture.inscriptionIds[1]),
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
        kind: "choreography",
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

    // What the dialog promised is what the deletion did.
    expect(statuses.get(fixture.choreographyIds[0])).toBe("depositPending");
    expect(statuses.get(fixture.choreographyIds[1])).toBe("depositMet");
  });

  test("names no resulting status when nothing un-crosses", async () => {
    const fixture = await seedDeletionFixture();
    const doomedPayment = fixture.paymentRows[0];

    // 1000 against a deposit of 3000: the inscription stays in `Seña pendiente`
    // before and after, so no threshold is uncrossed.
    await spreadFromPool(db, {
      academyId: fixture.academyId,
      amount: 1000,
      eventId: fixture.eventId,
      target: choreographyTarget(fixture.inscriptionIds[0]),
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
        kind: "choreography",
        name: "Aire",
        resultingStatus: null,
        uncrossingInscriptionCount: 0,
      },
    ]);
  });

  test("names the seminar by its instructor with the places its inscriptions lose", async () => {
    const fixture = await seedDeletionFixture();
    const doomedPayment = fixture.paymentRows[0];
    const seminar = await seedSeminarInscription(fixture);

    // Exactly the deposit of the stored row, so the inscription holds a place —
    // and the money comes out of the payment about to be deleted.
    await expect(
      allocateToSeminarInscription({
        academyId: fixture.academyId,
        amount: 2000,
        eventId: fixture.eventId,
        inscriptionId: seminar.inscriptionId,
        priceId: seminar.priceId,
        seminarId: seminar.seminarId,
      }),
    ).resolves.toEqual({ ok: true });

    expect(
      await readPaymentDeletionImpact({
        academyId: fixture.academyId,
        eventId: fixture.eventId,
        paymentId: doomedPayment.id,
      }),
    ).toEqual([
      {
        allocatedAmount: 2000,
        id: seminar.seminarId,
        kind: "seminar",
        losingPlaceCount: 1,
        name: "Abril Sosa",
      },
    ]);

    // The deletion never blocks, and the place the money held comes back.
    await db.delete(payments).where(eq(payments.id, doomedPayment.id));

    expect(await countCoveredSeminarInscriptions(seminar.seminarId)).toBe(0);
  });

  test("names a withdrawn seminar row's money while counting no place for it", async () => {
    const fixture = await seedDeletionFixture();
    const doomedPayment = fixture.paymentRows[0];
    const seminar = await seedSeminarInscription(fixture);

    await expect(
      allocateToSeminarInscription({
        academyId: fixture.academyId,
        amount: 2000,
        eventId: fixture.eventId,
        inscriptionId: seminar.inscriptionId,
        priceId: seminar.priceId,
        seminarId: seminar.seminarId,
      }),
    ).resolves.toEqual({ ok: true });

    // Withdrawal keeps the money on the row and gives the place back, so the
    // deletion still takes 2000 out of a row nobody would otherwise be warned
    // about — and there is no place left for it to lose.
    await db
      .update(seminarInscriptions)
      .set({ withdrawnAt: new Date("2026-10-01T12:00:00.000Z") })
      .where(eq(seminarInscriptions.id, seminar.inscriptionId));

    expect(
      await readPaymentDeletionImpact({
        academyId: fixture.academyId,
        eventId: fixture.eventId,
        paymentId: doomedPayment.id,
      }),
    ).toEqual([
      {
        allocatedAmount: 2000,
        id: seminar.seminarId,
        kind: "seminar",
        losingPlaceCount: 0,
        name: "Abril Sosa",
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
