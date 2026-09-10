import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  paymentAllocations,
  payments,
  prices,
} from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import { findDancerInscriptions } from "@/lib/dancers/inscriptions.server";
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
    "2026-06-15",
  );
});

/**
 * One `solo` inscription against two general rows: the fixture's 10000 with a
 * deadline of 2026-05-31, already past on the mocked business date, and a
 * 12000 successor with a deadline of 2026-06-30, the only row on offer today.
 * The inscription stores the expired row — the one the dateless resolver used
 * to quote for every inscription — so each case can tell "the row that applies
 * today" apart from "the row that was stored".
 */
async function seedDancerWithTwoPriceRows(input: { allocatedAmount: number }) {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: "Academia Ficha",
      email: `ficha.${crypto.randomUUID()}@example.com`,
      choreographyName: "Ficha coreografía",
      event,
    });
  const [expiredPrice] = await db
    .select({ id: prices.id })
    .from(prices)
    .where(eq(prices.eventId, event.id));
  await db.insert(prices).values({
    amount: 12000,
    eventId: event.id,
    groupType: "solo",
    name: "Precio Solo vigente",
    paymentDeadline: "2026-06-30",
    scheduleId: null,
  });

  if (!expiredPrice) {
    throw new Error("Expected the fixture price row.");
  }

  const dancer = await createDancer(academy.academy.id, {
    firstName: "Ana",
    lastName: "Ficha",
  });
  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
      selectedPriceId: expiredPrice.id,
    })
    .returning();

  if (!inscription) {
    throw new Error("Expected an inscription.");
  }

  if (input.allocatedAmount > 0) {
    await registerPaymentForTest({
      academyId: academy.academy.id,
      amount: String(input.allocatedAmount),
      eventId: event.id,
      paymentDate: "2026-06-15",
    });
    const payment = await db.query.payments.findFirst({
      where: eq(payments.academyId, academy.academy.id),
    });

    if (!payment) {
      throw new Error("Expected a registered payment.");
    }

    await db.insert(paymentAllocations).values({
      academyId: academy.academy.id,
      amount: input.allocatedAmount,
      eventId: event.id,
      inscriptionId: inscription.id,
      paymentId: payment.id,
    });
  }

  return {
    academyId: academy.academy.id,
    choreographyId: choreography.id,
    dancerId: dancer.id,
    eventId: event.id,
    inscriptionId: inscription.id,
  };
}

async function readBothSurfaces(
  fixture: Awaited<ReturnType<typeof seedDancerWithTwoPriceRows>>,
) {
  const { inscriptions } = await findDancerInscriptions({
    dancerId: fixture.dancerId,
    selectedEventId: fixture.eventId,
  });
  const dancerRow = inscriptions.find(
    (row) => row.id === fixture.choreographyId,
  );
  const detail = await readAcademyEventOperationalFinanceDetail({
    academyId: fixture.academyId,
    eventId: fixture.eventId,
  });
  const financeRow = detail.inscriptions.find(
    (row) => row.id === fixture.inscriptionId,
  );

  if (!dancerRow || !financeRow) {
    throw new Error("Expected both surfaces to resolve the inscription.");
  }

  return {
    dancer: {
      basePriceAmount: dancerRow.basePriceAmount,
      dancerDiscountAmount: dancerRow.dancerDiscountAmount,
      totalAmount: dancerRow.totalAmount,
    },
    finance: {
      basePriceAmount: financeRow.basePriceAmount,
      dancerDiscountAmount: financeRow.dancerDiscountAmount,
      totalAmount: financeRow.totalAmount,
    },
  };
}

describe.sequential(
  "the dancer detail prices through the finance read model",
  () => {
    test("excludes a row whose deadline has passed, matching the finance surfaces", async () => {
      // Below the deposit, so the stored (expired) row is not authoritative: the
      // price is the row on offer today. The dateless resolver used to quote the
      // expired 10000 here.
      const fixture = await seedDancerWithTwoPriceRows({ allocatedAmount: 0 });

      const read = await readBothSurfaces(fixture);

      expect(read.dancer).toEqual({
        basePriceAmount: 12000,
        dancerDiscountAmount: 0,
        totalAmount: 12000,
      });
      expect(read.finance).toEqual(read.dancer);
    });

    test("shows the stored row once the deposit is covered, like the finance surfaces", async () => {
      // 3000 is the stored row's deposit at 30 %, so the price is fixed on it
      // even though a dearer row is the one on offer today.
      const fixture = await seedDancerWithTwoPriceRows({
        allocatedAmount: 3000,
      });

      const read = await readBothSurfaces(fixture);

      expect(read.dancer).toEqual({
        basePriceAmount: 10000,
        dancerDiscountAmount: 0,
        totalAmount: 10000,
      });
      expect(read.finance).toEqual(read.dancer);
    });

    test("reads `Sin precio` when no row applies and nothing is stored", async () => {
      const fixture = await seedDancerWithTwoPriceRows({ allocatedAmount: 0 });
      await db
        .update(choreographyDancers)
        .set({ selectedPriceId: null })
        .where(eq(choreographyDancers.id, fixture.inscriptionId));
      // Past both deadlines: nothing is on offer and there is no stored row to
      // fall back to.
      vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
        "2026-07-01",
      );

      const read = await readBothSurfaces(fixture);

      expect(read.dancer).toEqual({
        basePriceAmount: null,
        dancerDiscountAmount: 0,
        totalAmount: null,
      });
      expect(read.finance).toEqual(read.dancer);
    });
  },
);
