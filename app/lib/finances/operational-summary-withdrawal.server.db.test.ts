import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  paymentAllocations,
  payments,
  prices,
} from "@/db/schema";
import {
  createChoreographyRecord,
  createDancer,
} from "@/features/portal/choreographies/test-support/db";
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
 * The financial read model is what both financial lists are drawn from, and it
 * is the only place the withdrawal of the **choreography** —as opposed to that
 * of its inscriptions— reaches a list. Retained money that no list shows is
 * money that gets forgotten, so the row's presence is pinned here rather than
 * left to each surface.
 */
describe("a withdrawn choreography in the financial read model", () => {
  test("stays in the rows, with its retained money and flagged withdrawn", async () => {
    const fixture = await seedWithdrawnChoreographyFixture();

    const detail = await readAcademyEventOperationalFinanceDetail({
      academyId: fixture.academyId,
      eventId: fixture.eventId,
    });

    expect(
      detail.choreographyFinanceRows.map((row) => ({
        allocatedAmount: row.allocatedAmount,
        name: row.name,
        withdrawn: row.withdrawn,
      })),
    ).toEqual([
      { allocatedAmount: 0, name: "Aire", withdrawn: false },
      { allocatedAmount: 4000, name: "Tango retirado", withdrawn: true },
    ]);
  });

  test("keeps its retained money in the academy's totals", async () => {
    const fixture = await seedWithdrawnChoreographyFixture();

    const detail = await readAcademyEventOperationalFinanceDetail({
      academyId: fixture.academyId,
      eventId: fixture.eventId,
    });

    // The deposit is still allocated: it did not go back to `Saldo disponible`,
    // which is the whole reason the choreography survives.
    expect(detail.summary.availableBalanceAmount).toBe(0);
    expect(detail.summary.totalPaidAmount).toBe(4000);
    expect(detail.summary.totalAmount).toEqual({
      amount: 4000,
      status: "complete",
    });
  });

  test("stays out of the status rollup and out of the count", async () => {
    const fixture = await seedWithdrawnChoreographyFixture();

    const detail = await readAcademyEventOperationalFinanceDetail({
      academyId: fixture.academyId,
      eventId: fixture.eventId,
    });
    const withdrawnRow = detail.choreographyFinanceRows.find(
      (row) => row.withdrawn,
    );

    // It used to read `Seña pendiente` with 0 `Inscriptos` — a choreography
    // nobody can act on asking for its deposit. Nothing is owed on it either.
    expect(withdrawnRow?.financialStatus).toBe("paidInFull");
    expect(withdrawnRow?.registrationCount).toBe(0);
    expect(detail.summary.owedDepositAmount).toEqual({
      amount: 0,
      status: "complete",
    });
    expect(detail.summary.owedBalanceAmount).toEqual({
      amount: 0,
      status: "complete",
    });
  });
});

/**
 * `Descuento por bailarín` needs no rule of its own for the withdrawn
 * choreography: withdrawal withdraws every inscription, and the qualifying set
 * already skips withdrawn ones. That is a claim about a composition, so it is
 * pinned here rather than assumed.
 */
describe("a withdrawn choreography and the dancer discount", () => {
  test("prices its siblings as if it did not exist", async () => {
    const fixture = await seedSharedDancerFixture();

    const detail = await readAcademyEventOperationalFinanceDetail({
      academyId: fixture.academyId,
      eventId: fixture.eventId,
    });

    // Three inscriptions of the same dancer would put the tier at 10%; with one
    // of the three choreographies withdrawn, only two qualify and the tier is
    // back to nothing. The prices have to resolve for the set to qualify at
    // all, so they are asserted beside the discount.
    expect(
      detail.inscriptions.map((inscription) => ({
        dancerDiscountAmount: inscription.dancerDiscountAmount,
        hasPrice: inscription.basePriceAmount !== null,
      })),
    ).toEqual([
      { dancerDiscountAmount: 0, hasPrice: true },
      { dancerDiscountAmount: 0, hasPrice: true },
      { dancerDiscountAmount: 0, hasPrice: true },
    ]);
  });
});

/**
 * Two choreographies of the same academy: one taking part with nothing
 * allocated, and one withdrawn holding a deposit of 4000. The money is what
 * makes the second one worth keeping in the list.
 */
async function seedWithdrawnChoreographyFixture() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, catalog } = await createAcademyFinanceChoreographyFixture({
    academyName: "Academia Retiro",
    choreographyName: "Aire",
    email: `retiro.${crypto.randomUUID()}@example.com`,
    event,
  });
  const withdrawnChoreography = await createChoreographyRecord({
    academyId: academy.academy.id,
    categoryId: catalog.categoryWithLevel.id,
    eventId: event.id,
    experienceLevelId: catalog.level.id,
    modalityId: catalog.modality.id,
    name: "Tango retirado",
    scheduleCapacityId: catalog.scheduleCapacity.id,
    submodalityId: catalog.submodality.id,
  });
  const dancer = await createDancer(academy.academy.id, {
    firstName: "Ana",
    lastName: "Retiro",
  });
  const price = await db.query.prices.findFirst({
    where: eq(prices.eventId, event.id),
  });

  if (!price) {
    throw new Error("Expected the event's price row.");
  }

  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: withdrawnChoreography.id,
      dancerId: dancer.id,
      selectedPriceId: price.id,
    })
    .returning();

  if (!inscription) {
    throw new Error("Expected an inscription.");
  }

  await registerPaymentForTest({
    academyId: academy.academy.id,
    amount: "4000",
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
    amount: 4000,
    choreographyInscriptionId: inscription.id,
    eventId: event.id,
    paymentId: payment.id,
  });

  // Withdrawal stamps the choreography and its inscriptions with the same
  // moment, which is what a restore later matches on.
  const withdrawnAt = new Date("2026-04-10T12:00:00Z");
  await db
    .update(choreographies)
    .set({ withdrawnAt })
    .where(eq(choreographies.id, withdrawnChoreography.id));
  await db
    .update(choreographyDancers)
    .set({ withdrawnAt })
    .where(eq(choreographyDancers.id, inscription.id));

  return { academyId: academy.academy.id, eventId: event.id };
}

/**
 * One dancer in three choreographies of the same academy, all at the same
 * price, with the last one withdrawn together with its inscription. Three
 * qualifying inscriptions would earn 10%; two earn nothing.
 */
async function seedSharedDancerFixture() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, catalog, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: "Academia Trio",
      choreographyName: "Uno",
      email: `trio.${crypto.randomUUID()}@example.com`,
      event,
    });
  const dancer = await createDancer(academy.academy.id, {
    firstName: "Sol",
    lastName: "Trio",
  });
  const price = await db.query.prices.findFirst({
    where: eq(prices.eventId, event.id),
  });

  if (!price) {
    throw new Error("Expected the event's price row.");
  }

  const choreographyIds = [choreography.id];

  for (const name of ["Dos", "Tres"]) {
    const sibling = await createChoreographyRecord({
      academyId: academy.academy.id,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name,
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    choreographyIds.push(sibling.id);
  }

  await db.insert(choreographyDancers).values(
    choreographyIds.map((choreographyId) => ({
      ageAtEventStart: 14,
      choreographyId,
      dancerId: dancer.id,
      selectedPriceId: price.id,
    })),
  );

  const withdrawnChoreographyId = choreographyIds[choreographyIds.length - 1]!;
  const withdrawnAt = new Date("2026-04-10T12:00:00Z");
  await db
    .update(choreographies)
    .set({ withdrawnAt })
    .where(eq(choreographies.id, withdrawnChoreographyId));
  await db
    .update(choreographyDancers)
    .set({ withdrawnAt })
    .where(eq(choreographyDancers.choreographyId, withdrawnChoreographyId));

  return { academyId: academy.academy.id, eventId: event.id };
}
