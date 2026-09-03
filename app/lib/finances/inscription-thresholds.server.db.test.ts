import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  paymentAllocations,
  payments,
  prices,
} from "@/db/schema";
import {
  createChoreographyRecord,
  createDancer,
} from "@/features/portal/choreographies/test-support/db";
import { readInscriptionThresholds } from "@/lib/finances/inscription-thresholds.server";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
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
 * One dancer with four `solo` inscriptions in the same event and academy, all at
 * the catalogue price of 10000 with a 30 % deposit, the fourth withdrawn.
 *
 * Four is the shape that makes the exclusion visible: the `Descuento por
 * bailarín` tier is 15 % at four qualifying inscriptions and 10 % at three, so
 * whether the withdrawn row counts changes what the three surviving siblings owe.
 */
async function seedWithdrawnDiscountFixture() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, catalog, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: "Academia Descuento",
      email: `descuento.${crypto.randomUUID()}@example.com`,
      choreographyName: "Aire",
      event,
    });

  const choreographyIds = [choreography.id];
  for (const name of ["Tango", "Vals", "Milonga"]) {
    const extra = await createChoreographyRecord({
      academyId: academy.academy.id,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name,
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    choreographyIds.push(extra.id);
  }

  const [price] = await db
    .select({ id: prices.id })
    .from(prices)
    .where(eq(prices.eventId, event.id));
  const dancer = await createDancer(academy.academy.id, {
    firstName: "Ana",
    lastName: "Descuento",
  });

  const activeInscriptionIds: string[] = [];
  let withdrawnInscriptionId = "";

  for (const [index, choreographyId] of choreographyIds.entries()) {
    const withdrawn = index === choreographyIds.length - 1;
    const [inscription] = await db
      .insert(choreographyDancers)
      .values({
        ageAtEventStart: 14,
        choreographyId,
        dancerId: dancer.id,
        selectedPriceId: price.id,
        withdrawnAt: withdrawn ? new Date("2026-04-01T12:00:00Z") : null,
      })
      .returning();

    if (!inscription) {
      throw new Error("Expected an inscription.");
    }

    if (withdrawn) {
      withdrawnInscriptionId = inscription.id;
    } else {
      activeInscriptionIds.push(inscription.id);
    }
  }

  return {
    academyId: academy.academy.id,
    activeInscriptionIds,
    eventId: event.id,
    withdrawnInscriptionId,
  };
}

function ascending(values: number[]) {
  return [...values].sort((a, b) => a - b);
}

describe.sequential("readInscriptionThresholds on a withdrawn sibling", () => {
  test("leaves the withdrawn inscription out of the discount qualifying set", async () => {
    const fixture = await seedWithdrawnDiscountFixture();

    const thresholds = await readInscriptionThresholds(db, {
      academyId: fixture.academyId,
      eventId: fixture.eventId,
      inscriptionIds: [
        ...fixture.activeInscriptionIds,
        fixture.withdrawnInscriptionId,
      ],
    });

    // Three qualifying inscriptions, not four: the tier is 10 %, and the first
    // one by price and id is the one that goes undiscounted. Were the withdrawn
    // row still counting, every one of these would read 15 %.
    const active = fixture.activeInscriptionIds.map((id) => {
      const resolution = thresholds.get(id);

      if (!resolution) {
        throw new Error("Expected a threshold resolution.");
      }

      return resolution;
    });

    expect(
      ascending(
        active.map((resolution) => resolution.dancerDiscountPercentage),
      ),
    ).toEqual([0, 10, 10]);
    expect(
      ascending(active.map((resolution) => resolution.dancerDiscountAmount)),
    ).toEqual([0, 1000, 1000]);
    expect(
      ascending(active.map((resolution) => resolution.totalAmount ?? 0)),
    ).toEqual([9000, 9000, 10000]);

    // It keeps its price and its deposit — the figures the withdrawal evidence
    // is read from — while taking no discount of its own.
    expect(thresholds.get(fixture.withdrawnInscriptionId)).toMatchObject({
      dancerDiscountAmount: 0,
      dancerDiscountPercentage: 0,
      depositAmount: 3000,
      priceAmount: 10000,
      totalAmount: 10000,
    });
  });

  test("agrees with the read path, which excludes it the same way", async () => {
    const fixture = await seedWithdrawnDiscountFixture();

    const detail = await readAcademyEventOperationalFinanceDetail({
      academyId: fixture.academyId,
      eventId: fixture.eventId,
    });

    const active = fixture.activeInscriptionIds.map((id) => {
      const inscription = detail.inscriptions.find((row) => row.id === id);

      if (!inscription) {
        throw new Error("Expected a resolved inscription.");
      }

      return inscription;
    });

    expect(
      ascending(active.map((inscription) => inscription.dancerDiscountAmount)),
    ).toEqual([0, 1000, 1000]);

    expect(
      detail.inscriptions.find(
        (row) => row.id === fixture.withdrawnInscriptionId,
      ),
    ).toMatchObject({ dancerDiscountAmount: 0, withdrawn: true });
  });
});

/**
 * One `solo` inscription storing the **more expensive** of the event's two price
 * rows, with an arbitrary amount already allocated to it.
 *
 * The two rows are what makes the rule observable. The catalogue row is 10000
 * with a deadline of 2026-05-31, so it is the one that applies on the mocked
 * business date; the stored row is 12000 with a later deadline of 2026-06-30,
 * so it is stored without ever being the current one. The two deposits — 3000 for
 * the current row, 3600 for the stored one — straddle each other, which is what
 * lets a test tell "crossed against the stored row" apart from "crossed against
 * the current one".
 *
 * The stored row goes in with the inscription rather than being updated
 * afterwards, because the database guard would refuse the update once the
 * allocations are there.
 */
async function seedPriceLockFixture(input: {
  allocatedAmount: number;
  currentAmount?: number;
  storedAmount?: number;
}) {
  const allocatedAmount = input.allocatedAmount;
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: "Academia Precio",
      email: `precio.${crypto.randomUUID()}@example.com`,
      choreographyName: "Precio coreografía",
      event,
    });
  const [currentPrice] = await db
    .update(prices)
    .set({ amount: input.currentAmount ?? 10000 })
    .where(eq(prices.eventId, event.id))
    .returning();
  const [storedPrice] = await db
    .insert(prices)
    .values({
      amount: input.storedAmount ?? 12000,
      eventId: event.id,
      groupType: "solo",
      name: "Precio Solo posterior",
      paymentDeadline: "2026-06-30",
      scheduleId: null,
    })
    .returning();

  if (!currentPrice || !storedPrice) {
    throw new Error("Expected both price rows.");
  }
  const dancer = await createDancer(academy.academy.id, {
    firstName: "Ana",
    lastName: "Precio",
  });
  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
      selectedPriceId: storedPrice.id,
    })
    .returning();

  if (!inscription) {
    throw new Error("Expected an inscription.");
  }

  if (allocatedAmount > 0) {
    await registerPaymentForTest({
      academyId: academy.academy.id,
      amount: String(allocatedAmount),
      eventId: event.id,
      paymentDate: "2026-04-10",
    });
    const payment = await db.query.payments.findFirst({
      where: eq(payments.academyId, academy.academy.id),
    });

    if (!payment) {
      throw new Error("Expected a registered payment.");
    }

    await db.insert(paymentAllocations).values({
      academyId: academy.academy.id,
      amount: allocatedAmount,
      eventId: event.id,
      inscriptionId: inscription.id,
      paymentId: payment.id,
    });
  }

  return {
    academyId: academy.academy.id,
    eventId: event.id,
    inscriptionId: inscription.id,
  };
}

/**
 * The same question asked of both readers. They resolve prices separately, and
 * a divergence between them is a bug rather than a nuance, so every case below
 * asserts on the pair.
 */
async function readBothPaths(fixture: {
  academyId: string;
  eventId: string;
  inscriptionId: string;
}) {
  const thresholds = await readInscriptionThresholds(db, {
    academyId: fixture.academyId,
    eventId: fixture.eventId,
    inscriptionIds: [fixture.inscriptionId],
  });
  const resolution = thresholds.get(fixture.inscriptionId);
  const detail = await readAcademyEventOperationalFinanceDetail({
    academyId: fixture.academyId,
    eventId: fixture.eventId,
  });
  const inscription = detail.inscriptions.find(
    (row) => row.id === fixture.inscriptionId,
  );

  if (!resolution || !inscription) {
    throw new Error("Expected both readers to resolve the inscription.");
  }

  return {
    summary: {
      depositAmount: inscription.depositAmount,
      priceAmount: inscription.basePriceAmount,
      totalAmount: inscription.totalAmount,
    },
    thresholds: {
      depositAmount: resolution.depositAmount,
      priceAmount: resolution.priceAmount,
      totalAmount: resolution.totalAmount,
    },
  };
}

describe.sequential("the price lock at the deposit threshold", () => {
  test("follows the price list while the inscription is below its deposit", async () => {
    // 1000 against a stored deposit of 3600: below it, so the stored row is not
    // authoritative and the read re-derives from the row that applies today.
    // A refresh moves this figure, and so does the passage of time.
    const fixture = await seedPriceLockFixture({ allocatedAmount: 1000 });

    const read = await readBothPaths(fixture);

    expect(read.thresholds).toEqual({
      depositAmount: 3000,
      priceAmount: 10000,
      totalAmount: 10000,
    });
    expect(read.summary).toEqual(read.thresholds);
  });

  test("fixes the stored price once the inscription covers its deposit", async () => {
    const fixture = await seedPriceLockFixture({ allocatedAmount: 3600 });

    const read = await readBothPaths(fixture);

    expect(read.thresholds).toEqual({
      depositAmount: 3600,
      priceAmount: 12000,
      totalAmount: 12000,
    });
    expect(read.summary).toEqual(read.thresholds);
  });

  test("measures the crossing against the stored price and not the current one", async () => {
    // 3000 is exactly the **current** row's seña and 600 short of the stored
    // row's. Were the crossing measured against the current price the read
    // would lock onto the stored 12000 here, and the answer to "has it
    // crossed?" would depend on which price was asked about.
    const fixture = await seedPriceLockFixture({ allocatedAmount: 3000 });

    const read = await readBothPaths(fixture);

    expect(read.thresholds.priceAmount).toBe(10000);
    expect(read.summary.priceAmount).toBe(10000);

    // The band where the two `≥` disagree. The badge is derived from the
    // **effective** price, whose deposit is 3000, so it already reads `Señada`;
    // the lock is measured against the **stored** price, whose deposit is 3600, so
    // the price is still loose. Documented in `docs/domain/finances.md`, and
    // one-sided: `Seña pendiente` next to a fixed price cannot happen.
    const detail = await readAcademyEventOperationalFinanceDetail({
      academyId: fixture.academyId,
      eventId: fixture.eventId,
    });
    expect(
      detail.inscriptions.find((row) => row.id === fixture.inscriptionId),
    ).toMatchObject({ depositAmount: 3000, financialStatus: "depositMet" });
  });

  test("falls back to the stored price when no row applies at all", async () => {
    const fixture = await seedPriceLockFixture({ allocatedAmount: 1000 });
    // Past both deadlines: nothing is on offer, and the row the administrator
    // chose is the only price there is. This is why the stored row is still
    // worth writing below the threshold.
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-07-01",
    );

    const read = await readBothPaths(fixture);

    expect(read.thresholds).toEqual({
      depositAmount: 3600,
      priceAmount: 12000,
      totalAmount: 12000,
    });
    expect(read.summary).toEqual(read.thresholds);
  });

  test("tolerates the over-allocation a price list rolling down can now produce", async () => {
    // A new route into `Sobreasignada`: the stored row is 100000, so its deposit is
    // 30000 and 25000 has not crossed it; the row that applies today charges
    // 20000, and the read follows it. What was already allocated now sits above
    // the total.
    const fixture = await seedPriceLockFixture({
      allocatedAmount: 25000,
      currentAmount: 20000,
      storedAmount: 100000,
    });

    const read = await readBothPaths(fixture);
    const detail = await readAcademyEventOperationalFinanceDetail({
      academyId: fixture.academyId,
      eventId: fixture.eventId,
    });
    const inscription = detail.inscriptions.find(
      (row) => row.id === fixture.inscriptionId,
    );

    // Passive over-allocation is tolerated by design: it reads, it warns
    // through the badge, and nothing throws.
    expect(read.thresholds.totalAmount).toBe(20000);
    expect(inscription).toMatchObject({
      anomalies: ["overAllocated"],
      financialStatus: "paidInFull",
      overAllocatedAmount: 5000,
      owedBalanceAmount: 0,
    });
  });
});
