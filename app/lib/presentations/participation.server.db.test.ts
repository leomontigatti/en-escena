import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { choreographyDancers, presentations, schedules } from "@/db/schema";
import type { ExperienceLevel } from "@/lib/events/experience-levels";
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
import {
  restoreChoreographyForTest,
  withdrawChoreographyForTest,
} from "@/lib/choreographies/withdrawn-choreography.test-support";
import { evaluatedChoreographyIds } from "@/lib/presentations/evaluation-lock.test-support";
import { derivePresentationWarnings } from "@/lib/presentations/warnings";
import {
  movePresentation,
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
   * money off it. `waived` keeps the money off and waives the inscription, so
   * the choreography reads `Bonificada`.
   */
  const addChoreography = async (input: {
    belowDeposit?: boolean;
    experienceLevelId?: ExperienceLevel | null;
    name: string;
    orderNumber?: number;
    /** Another schedule of the event; the catalog's own when absent. */
    scheduleId?: string;
    waived?: boolean;
  }) => {
    const choreography = await createChoreographyRecord({
      academyId: academy.academy.id,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId:
        input.experienceLevelId === undefined
          ? catalog.level.id
          : input.experienceLevelId,
      modalityId: catalog.modality.id,
      name: input.name,
      scheduleCapacityId: input.scheduleId ? null : catalog.scheduleCapacity.id,
      scheduleId: input.scheduleId,
    });
    const dancer = await createDancer(academy.academy.id);

    await createSelectedPriceInscriptionForTest({
      academyId: academy.academy.id,
      allocatedAmount:
        input.belowDeposit || input.waived ? undefined : paidInFullAmount,
      choreographyId: choreography.id,
      dancerId: dancer.id,
      eventId: event.id,
    });

    if (input.waived) {
      await setWaived(choreography.id, true);
    }

    if (input.orderNumber !== undefined) {
      await db.insert(presentations).values({
        choreographyId: choreography.id,
        eventId: event.id,
        orderNumber: input.orderNumber,
      });
    }

    return choreography;
  };

  /** A schedule of the event on the day after the catalog's. */
  const addNextDaySchedule = async () => {
    const [schedule] = await db
      .insert(schedules)
      .values({
        eventId: event.id,
        name: "Día siguiente",
        scheduledDate: "2026-05-02",
        startTime: "10:00",
        totalCapacity: 10,
      })
      .returning();

    return schedule;
  };

  return { academy, addChoreography, addNextDaySchedule, catalog, event };
}

async function setWaived(choreographyId: string, waived: boolean) {
  await db
    .update(choreographyDancers)
    .set({ waivedAt: waived ? new Date("2026-04-01T12:00:00Z") : null })
    .where(eq(choreographyDancers.choreographyId, choreographyId));
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

  test("keeps a choreography below its deposit, numbered or not, and says so", async () => {
    const { addChoreography, event } = await seedEvent();
    const late = await addChoreography({
      belowDeposit: true,
      name: "Sin seña",
    });
    const numbered = await addChoreography({
      belowDeposit: true,
      name: "Sin seña numerada",
      orderNumber: 1,
    });

    const rows = await readParticipationRows(event.id);

    expect(rows.map((row) => row.choreographyId)).toEqual([
      numbered.id,
      late.id,
    ]);
    expect(rows.map((row) => row.financialStatus)).toEqual([
      "depositPending",
      "depositPending",
    ]);
  });

  test("leaves out a withdrawn choreography, numbered or not", async () => {
    const { addChoreography, event } = await seedEvent();
    const performing = await addChoreography({ name: "En escena" });
    const withdrawnLate = await addChoreography({ name: "Retirada" });
    const withdrawnNumbered = await addChoreography({
      name: "Retirada numerada",
      orderNumber: 2,
    });

    await withdrawChoreographyForTest(withdrawnLate.id);
    await withdrawChoreographyForTest(withdrawnNumbered.id);

    const rows = await readParticipationRows(event.id);

    expect(rows.map((row) => row.choreographyId)).toEqual([performing.id]);
  });

  test("carries the category's levels, so a row without one is warned", async () => {
    const { addChoreography, event } = await seedEvent();
    const levelless = await addChoreography({
      experienceLevelId: null,
      name: "Sin nivel",
      orderNumber: 1,
    });

    const rows = await readParticipationRows(event.id);

    expect(rows[0].category.experienceLevels.length).toBeGreaterThan(0);
    expect(
      derivePresentationWarnings(rows)
        .get(levelless.id)
        ?.map((warning) => warning.kind),
    ).toContain("missingLevel");
  });

  test("lists a withdrawn choreography again once it is restored", async () => {
    const { addChoreography, event } = await seedEvent();
    const choreography = await addChoreography({ name: "Restaurada" });

    await withdrawChoreographyForTest(choreography.id);
    await restoreChoreographyForTest(choreography.id);

    const rows = await readParticipationRows(event.id);

    expect(rows.map((row) => row.choreographyId)).toEqual([choreography.id]);
  });
});

describe("runAutomaticOrdering", () => {
  test("gives no number to a withdrawn choreography", async () => {
    const { addChoreography, event } = await seedEvent();
    const performing = await addChoreography({ name: "En escena" });
    const withdrawn = await addChoreography({ name: "Retirada" });

    await withdrawChoreographyForTest(withdrawn.id);

    const result = await runAutomaticOrdering(event.id);

    expect(result).toEqual({ ok: true, frozenCount: 0, orderedCount: 1 });
    expect(await readOrder(event.id)).toEqual([
      expect.objectContaining({
        choreographyId: performing.id,
        orderNumber: 1,
      }),
    ]);
  });

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

    expect(result).toEqual({ ok: true, frozenCount: 0, orderedCount: 3 });

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

  test("orders by experience level before anything inside the schedule", async () => {
    const { addChoreography, event } = await seedEvent();
    const amateur = await addChoreography({
      experienceLevelId: "amateur",
      name: "Amateur",
    });
    const nudo = await addChoreography({
      experienceLevelId: "nudo",
      name: "Nudo",
    });

    const result = await runAutomaticOrdering(event.id);

    expect(result).toEqual({ ok: true, frozenCount: 0, orderedCount: 2 });
    expect(
      (await readOrder(event.id)).map(
        (presentation) => presentation.choreographyId,
      ),
    ).toEqual([nudo.id, amateur.id]);
  });

  test("keeps the frozen rows where they are and places the late one after them", async () => {
    const { addChoreography, event } = await seedEvent();
    const scored = await addChoreography({ name: "Evaluada", orderNumber: 1 });
    const tail = await addChoreography({ name: "Cola", orderNumber: 2 });
    const late = await addChoreography({ name: "Tardía" });

    evaluatedChoreographyIds.add(scored.id);

    const result = await runAutomaticOrdering(event.id);

    expect(result).toEqual({ ok: true, frozenCount: 2, orderedCount: 1 });
    expect(await readOrder(event.id)).toEqual([
      expect.objectContaining({ choreographyId: scored.id, orderNumber: 1 }),
      expect.objectContaining({ choreographyId: tail.id, orderNumber: 2 }),
      expect.objectContaining({ choreographyId: late.id, orderNumber: 3 }),
    ]);
  });

  test("refuses when every presentation is frozen", async () => {
    const { addChoreography, event } = await seedEvent();
    const numbered = await addChoreography({
      name: "Evaluada",
      orderNumber: 3,
    });

    evaluatedChoreographyIds.add(numbered.id);

    const result = await runAutomaticOrdering(event.id);

    expect(result).toEqual({ ok: false, reason: "nothingToOrder" });
    expect((await readOrder(event.id))[0].orderNumber).toBe(3);
  });

  test("numbers a choreography below its deposit", async () => {
    const { addChoreography, event } = await seedEvent();
    const unpaid = await addChoreography({
      belowDeposit: true,
      name: "Sin seña",
    });

    expect(await runAutomaticOrdering(event.id)).toEqual({
      ok: true,
      frozenCount: 0,
      orderedCount: 1,
    });
    expect(await readOrder(event.id)).toEqual([
      expect.objectContaining({ choreographyId: unpaid.id, orderNumber: 1 }),
    ]);
  });

  test("orders only the chosen day and shifts the days after it", async () => {
    const { addChoreography, addNextDaySchedule, catalog, event } =
      await seedEvent();
    const nextDay = await addNextDaySchedule();
    const second = await addChoreography({ name: "Segunda", orderNumber: 1 });
    const first = await addChoreography({ name: "Primera", orderNumber: 2 });
    const late = await addChoreography({ name: "Tardía" });
    const movedByHand = await addChoreography({
      name: "Movida a mano",
      orderNumber: 3,
      scheduleId: nextDay.id,
    });
    const nextDayFirst = await addChoreography({
      name: "Primera del día siguiente",
      orderNumber: 4,
      scheduleId: nextDay.id,
    });

    const result = await runAutomaticOrdering(event.id, [
      catalog.schedule.scheduledDate,
    ]);

    expect(result).toEqual({ ok: true, frozenCount: 0, orderedCount: 3 });
    expect(
      (await readOrder(event.id)).map((row) => [
        row.choreographyId,
        row.orderNumber,
      ]),
    ).toEqual([
      [second.id, 1],
      [first.id, 2],
      [late.id, 3],
      [movedByHand.id, 4],
      [nextDayFirst.id, 5],
    ]);
  });

  test("refuses when there is nothing to order", async () => {
    const { event } = await seedEvent();

    expect(await runAutomaticOrdering(event.id)).toEqual({
      ok: false,
      reason: "nothingToOrder",
    });
    expect(await readOrder(event.id)).toEqual([]);
  });
});

describe("a waived choreography (`Bonificada`)", () => {
  test("gets a number in the automatic ordering with no money on it", async () => {
    const { addChoreography, event } = await seedEvent();
    const waived = await addChoreography({ name: "Bonificada", waived: true });

    const result = await runAutomaticOrdering(event.id);

    expect(result).toEqual({ ok: true, frozenCount: 0, orderedCount: 1 });
    expect(await readOrder(event.id)).toEqual([
      expect.objectContaining({ choreographyId: waived.id, orderNumber: 1 }),
    ]);
  });

  test("can be placed by hand as a late row", async () => {
    const { addChoreography, event } = await seedEvent();
    await addChoreography({ name: "Primera", orderNumber: 1 });
    const late = await addChoreography({ name: "Tardía", waived: true });

    const result = await movePresentation({
      choreographyId: late.id,
      eventId: event.id,
      fromOrderNumber: null,
      toOrderNumber: 2,
    });

    expect(result).toEqual({ ok: true, movedToOrderNumber: 2 });
  });

  test("keeps its number once the waiver is taken off", async () => {
    const { addChoreography, event } = await seedEvent();
    const waived = await addChoreography({ name: "Bonificada", waived: true });
    await runAutomaticOrdering(event.id);

    await setWaived(waived.id, false);

    const rows = await readParticipationRows(event.id);
    expect(rows).toEqual([
      expect.objectContaining({
        choreographyId: waived.id,
        financialStatus: "depositPending",
        orderNumber: 1,
      }),
    ]);
  });
});

describe("movePresentation", () => {
  test("renumbers the event contiguously and closes the gaps it finds", async () => {
    const { addChoreography, event } = await seedEvent();
    const first = await addChoreography({ name: "Primera", orderNumber: 1 });
    const second = await addChoreography({ name: "Segunda", orderNumber: 5 });
    const third = await addChoreography({ name: "Tercera", orderNumber: 9 });

    const result = await movePresentation({
      choreographyId: third.id,
      eventId: event.id,
      fromOrderNumber: 9,
      toOrderNumber: 1,
    });

    expect(result).toEqual({ ok: true, movedToOrderNumber: 1 });
    expect(await readOrder(event.id)).toEqual([
      expect.objectContaining({ choreographyId: third.id, orderNumber: 1 }),
      expect.objectContaining({ choreographyId: first.id, orderNumber: 2 }),
      expect.objectContaining({ choreographyId: second.id, orderNumber: 3 }),
    ]);
  });

  test("keeps the presentation id of every row it renumbers", async () => {
    const { addChoreography, event } = await seedEvent();
    await addChoreography({ name: "Primera", orderNumber: 1 });
    const second = await addChoreography({ name: "Segunda", orderNumber: 2 });
    const before = await readOrder(event.id);

    await movePresentation({
      choreographyId: second.id,
      eventId: event.id,
      fromOrderNumber: 2,
      toOrderNumber: 1,
    });

    const after = await readOrder(event.id);

    for (const row of before) {
      expect(
        after.find((current) => current.choreographyId === row.choreographyId)
          ?.id,
      ).toBe(row.id);
    }
  });

  test("refuses a stale from-number and writes nothing", async () => {
    const { addChoreography, event } = await seedEvent();
    const first = await addChoreography({ name: "Primera", orderNumber: 1 });
    await addChoreography({ name: "Segunda", orderNumber: 2 });

    const result = await movePresentation({
      choreographyId: first.id,
      eventId: event.id,
      fromOrderNumber: 2,
      toOrderNumber: 2,
    });

    expect(result).toEqual({ ok: false, reason: "stale" });
    expect((await readOrder(event.id)).map((row) => row.orderNumber)).toEqual([
      1, 2,
    ]);
  });

  test("places a late row by creating its presentation and shifting the rest down", async () => {
    const { addChoreography, event } = await seedEvent();
    const first = await addChoreography({ name: "Primera", orderNumber: 1 });
    const second = await addChoreography({ name: "Segunda", orderNumber: 2 });
    const late = await addChoreography({ name: "Tardía" });

    const result = await movePresentation({
      choreographyId: late.id,
      eventId: event.id,
      fromOrderNumber: null,
      toOrderNumber: 2,
    });

    expect(result).toEqual({ ok: true, movedToOrderNumber: 2 });
    expect(await readOrder(event.id)).toEqual([
      expect.objectContaining({ choreographyId: first.id, orderNumber: 1 }),
      expect.objectContaining({ choreographyId: late.id, orderNumber: 2 }),
      expect.objectContaining({ choreographyId: second.id, orderNumber: 3 }),
    ]);
  });

  test("places a late row that is below its deposit", async () => {
    const { addChoreography, event } = await seedEvent();
    const first = await addChoreography({ name: "Primera", orderNumber: 1 });
    const late = await addChoreography({
      belowDeposit: true,
      name: "Sin seña",
    });

    const result = await movePresentation({
      choreographyId: late.id,
      eventId: event.id,
      fromOrderNumber: null,
      toOrderNumber: 1,
    });

    expect(result).toEqual({ ok: true, movedToOrderNumber: 1 });
    expect(await readOrder(event.id)).toEqual([
      expect.objectContaining({ choreographyId: late.id, orderNumber: 1 }),
      expect.objectContaining({ choreographyId: first.id, orderNumber: 2 }),
    ]);
  });

  test("refuses to move a frozen row, and refuses a frozen number as the target", async () => {
    const { addChoreography, event } = await seedEvent();
    const scored = await addChoreography({ name: "Evaluada", orderNumber: 1 });
    const tail = await addChoreography({ name: "Cola", orderNumber: 2 });
    const late = await addChoreography({ name: "Tardía" });

    evaluatedChoreographyIds.add(scored.id);

    expect(
      await movePresentation({
        choreographyId: tail.id,
        eventId: event.id,
        fromOrderNumber: 2,
        toOrderNumber: 1,
      }),
    ).toEqual({ ok: false, reason: "frozenRow" });
    expect(
      await movePresentation({
        choreographyId: late.id,
        eventId: event.id,
        fromOrderNumber: null,
        toOrderNumber: 2,
      }),
    ).toEqual({ ok: false, reason: "frozenPosition" });
    expect(
      await movePresentation({
        choreographyId: late.id,
        eventId: event.id,
        fromOrderNumber: null,
        toOrderNumber: 3,
      }),
    ).toEqual({ ok: true, movedToOrderNumber: 3 });
    expect((await readOrder(event.id)).map((row) => row.orderNumber)).toEqual([
      1, 2, 3,
    ]);
  });

  test("refuses every move before the event's first automatic ordering", async () => {
    const { addChoreography, event } = await seedEvent();
    const only = await addChoreography({ name: "Primera" });

    const result = await movePresentation({
      choreographyId: only.id,
      eventId: event.id,
      fromOrderNumber: null,
      toOrderNumber: 1,
    });

    expect(result).toEqual({ ok: false, reason: "notOrdered" });
    expect(await readOrder(event.id)).toEqual([]);
  });
});
