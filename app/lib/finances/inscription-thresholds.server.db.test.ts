import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { choreographyDancers, prices } from "@/db/schema";
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
