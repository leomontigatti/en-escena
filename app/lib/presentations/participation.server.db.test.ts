import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { presentations } from "@/db/schema";
import {
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
  createSelectedPriceInscriptionForTest,
} from "@/features/portal/choreographies/test-support/db";
import {
  createAcademyUser,
  createSavedEvent,
} from "@/lib/admin/finances/finances.test-support";
import { evaluatedChoreographyIds } from "@/lib/presentations/evaluation-lock.test-support";
import {
  readParticipationRows,
  runAutomaticOrdering,
} from "@/lib/presentations/participation.server";

import * as businessTimeZone from "@/lib/shared/business-time-zone";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

vi.mock(
  "@/lib/presentations/evaluation-lock.server",
  async () =>
    (await import("@/lib/presentations/evaluation-lock.test-support"))
      .evaluationLockStub,
);

installDatabaseTestHooks();

beforeEach(() => {
  // The fixture price expires before today, and an expired ladder resolves to
  // no price, which leaves every choreography below its deposit.
  vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
    "2026-04-10",
  );
});

afterEach(() => {
  evaluatedChoreographyIds.clear();
  vi.restoreAllMocks();
});

/** Enough money to cover the deposit of any fixture price. */
const paidInFullAmount = 100000;

async function seedEvent() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const academy = await createAcademyUser({
    academyName: `Academia ${crypto.randomUUID()}`,
    email: `${crypto.randomUUID()}@example.com`,
  });
  const catalog = await createEventCatalog(event.id);

  /**
   * One choreography with one dancer, `Señada` unless the caller keeps the
   * money off it.
   */
  const addChoreography = async (input: {
    belowDeposit?: boolean;
    name: string;
    orderNumber?: number;
  }) => {
    const choreography = await createChoreographyRecord({
      academyId: academy.academy.id,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: input.name,
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });
    const dancer = await createDancer(academy.academy.id);

    await createSelectedPriceInscriptionForTest({
      academyId: academy.academy.id,
      allocatedAmount: input.belowDeposit ? undefined : paidInFullAmount,
      choreographyId: choreography.id,
      dancerId: dancer.id,
      eventId: event.id,
    });

    if (input.orderNumber !== undefined) {
      await db.insert(presentations).values({
        choreographyId: choreography.id,
        eventId: event.id,
        orderNumber: input.orderNumber,
      });
    }

    return choreography;
  };

  return { academy, addChoreography, catalog, event };
}

async function readOrder(eventId: string) {
  return await db
    .select({
      choreographyId: presentations.choreographyId,
      id: presentations.id,
      orderNumber: presentations.orderNumber,
    })
    .from(presentations)
    .where(eq(presentations.eventId, eventId))
    .orderBy(asc(presentations.orderNumber));
}

describe("readParticipationRows", () => {
  test("lists the numbered rows first and the rest by choreography number", async () => {
    const { addChoreography, event } = await seedEvent();
    const late = await addChoreography({ name: "Tardía" });
    const numbered = await addChoreography({
      name: "Numerada",
      orderNumber: 7,
    });

    const rows = await readParticipationRows(event.id);

    expect(rows.map((row) => row.choreographyId)).toEqual([
      numbered.id,
      late.id,
    ]);
    expect(rows[0].orderNumber).toBe(7);
    expect(rows[1].orderNumber).toBeNull();
  });

  test("leaves out a choreography below its deposit that was never numbered", async () => {
    const { addChoreography, event } = await seedEvent();
    await addChoreography({ belowDeposit: true, name: "Sin seña" });
    const numbered = await addChoreography({
      belowDeposit: true,
      name: "Sin seña numerada",
      orderNumber: 1,
    });

    const rows = await readParticipationRows(event.id);

    expect(rows.map((row) => row.choreographyId)).toEqual([numbered.id]);
    expect(rows[0].financialStatus).toBe("depositPending");
  });
});

describe("runAutomaticOrdering", () => {
  test("keeps the ids of the existing presentations, inserts the late ones and deletes nothing", async () => {
    const { addChoreography, event } = await seedEvent();
    const numbered = await addChoreography({
      name: "Numerada",
      orderNumber: 4,
    });
    const belowDeposit = await addChoreography({
      belowDeposit: true,
      name: "Sin seña numerada",
      orderNumber: 9,
    });
    const late = await addChoreography({ name: "Tardía" });
    const before = await readOrder(event.id);

    const result = await runAutomaticOrdering(event.id);

    expect(result).toEqual({ ok: true, orderedCount: 3 });

    const after = await readOrder(event.id);

    expect(after.map((row) => row.orderNumber)).toEqual([1, 2, 3]);
    expect(new Set(after.map((row) => row.choreographyId))).toEqual(
      new Set([numbered.id, belowDeposit.id, late.id]),
    );

    for (const row of before) {
      expect(
        after.find((current) => current.choreographyId === row.choreographyId)
          ?.id,
      ).toBe(row.id);
    }
  });

  test("refuses when a presentation was already evaluated", async () => {
    const { addChoreography, event } = await seedEvent();
    const numbered = await addChoreography({
      name: "Evaluada",
      orderNumber: 3,
    });

    evaluatedChoreographyIds.add(numbered.id);

    const result = await runAutomaticOrdering(event.id);

    expect(result).toEqual({ ok: false, reason: "evaluated" });
    expect((await readOrder(event.id))[0].orderNumber).toBe(3);
  });

  test("refuses when there is nothing to order", async () => {
    const { addChoreography, event } = await seedEvent();
    await addChoreography({ belowDeposit: true, name: "Sin seña" });

    expect(await runAutomaticOrdering(event.id)).toEqual({
      ok: false,
      reason: "nothingToOrder",
    });
    expect(await readOrder(event.id)).toEqual([]);
  });
});
