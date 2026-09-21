import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { choreographies, events, presentations } from "@/db/schema";
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
  hasEventPresentations,
  isEventProgramVisible,
  readAcademyPresentations,
} from "@/lib/presentations/academy-program.server";

import * as businessTimeZone from "@/lib/shared/business-time-zone";

import { installDatabaseTestHooks } from "../../../tests/db/harness";
import { eq } from "drizzle-orm";

installDatabaseTestHooks();

beforeEach(() => {
  vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
    "2026-04-10",
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Enough money to cover the deposit of any fixture price. */
const paidInFullAmount = 100000;

async function seedEvent() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const catalog = await createEventCatalog(event.id);

  const addAcademy = async () => {
    const academy = await createAcademyUser({
      academyName: `Academia ${crypto.randomUUID()}`,
      email: `${crypto.randomUUID()}@example.com`,
    });

    const addChoreography = async (input: {
      belowDeposit?: boolean;
      dancerCount?: number;
      groupType?: "solo" | "duo" | "trio" | "grupal";
      name: string;
      orderNumber?: number;
    }) => {
      const choreography = await createChoreographyRecord({
        academyId: academy.academy.id,
        categoryId: catalog.categoryWithLevel.id,
        eventId: event.id,
        experienceLevelId: catalog.level.id,
        groupType: input.groupType,
        modalityId: catalog.modality.id,
        name: input.name,
        scheduleCapacityId: catalog.scheduleCapacity.id,
      });

      for (let index = 0; index < (input.dancerCount ?? 1); index += 1) {
        const dancer = await createDancer(academy.academy.id, {
          firstName: `Bailarina${index}`,
        });

        await createSelectedPriceInscriptionForTest({
          academyId: academy.academy.id,
          allocatedAmount:
            input.belowDeposit || index > 0 ? undefined : paidInFullAmount,
          choreographyId: choreography.id,
          dancerId: dancer.id,
          eventId: event.id,
        });
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

    return { academy: academy.academy, addChoreography };
  };

  /** Stamps the choreography the way `removeChoreography` withdraws it. */
  const withdrawChoreography = async (choreographyId: string) => {
    await db
      .update(choreographies)
      .set({ withdrawnAt: new Date("2026-09-17T12:00:00Z") })
      .where(eq(choreographies.id, choreographyId));
  };

  return { addAcademy, catalog, event, withdrawChoreography };
}

describe("readAcademyPresentations", () => {
  test("lists the numbered rows, the late ones and nothing else, in reading order", async () => {
    const { addAcademy, event } = await seedEvent();
    const { academy, addChoreography } = await addAcademy();
    const late = await addChoreography({ name: "Tardía" });
    const numbered = await addChoreography({
      name: "Numerada",
      orderNumber: 5,
    });
    const belowDepositNumbered = await addChoreography({
      belowDeposit: true,
      name: "Sin seña numerada",
      orderNumber: 2,
    });
    await addChoreography({ belowDeposit: true, name: "Sin seña sin número" });

    const rows = await readAcademyPresentations({
      academyId: academy.id,
      eventId: event.id,
    });

    expect(rows.map((row) => row.choreographyId)).toEqual([
      belowDepositNumbered.id,
      numbered.id,
      late.id,
    ]);
    expect(rows[0].isBelowDeposit).toBe(true);
    expect(rows[1].isBelowDeposit).toBe(false);
    expect(rows[2].orderNumber).toBeNull();
  });

  test("leaves out another academy's rows", async () => {
    const { addAcademy, event } = await seedEvent();
    const mine = await addAcademy();
    const theirs = await addAcademy();
    const own = await mine.addChoreography({ name: "Propia", orderNumber: 1 });
    await theirs.addChoreography({ name: "Ajena", orderNumber: 2 });

    const rows = await readAcademyPresentations({
      academyId: mine.academy.id,
      eventId: event.id,
    });

    expect(rows.map((row) => row.choreographyId)).toEqual([own.id]);
  });

  test("leaves out the academy's withdrawn choreographies", async () => {
    const { addAcademy, event, withdrawChoreography } = await seedEvent();
    const { academy, addChoreography } = await addAcademy();
    const performing = await addChoreography({
      name: "En escena",
      orderNumber: 1,
    });
    const withdrawnNumbered = await addChoreography({
      name: "Retirada numerada",
      orderNumber: 2,
    });
    const withdrawnLate = await addChoreography({ name: "Retirada" });

    await withdrawChoreography(withdrawnNumbered.id);
    await withdrawChoreography(withdrawnLate.id);

    const rows = await readAcademyPresentations({
      academyId: academy.id,
      eventId: event.id,
    });

    expect(rows.map((row) => row.choreographyId)).toEqual([performing.id]);

    await db
      .update(choreographies)
      .set({ withdrawnAt: null })
      .where(eq(choreographies.id, withdrawnLate.id));

    const restored = await readAcademyPresentations({
      academyId: academy.id,
      eventId: event.id,
    });

    expect(restored.map((row) => row.choreographyId)).toEqual([
      performing.id,
      withdrawnLate.id,
    ]);
  });

  test("names the dancers of a solo and a duo and of nothing else", async () => {
    const { addAcademy, event } = await seedEvent();
    const { academy, addChoreography } = await addAcademy();
    const solo = await addChoreography({
      groupType: "solo",
      name: "Sola",
      orderNumber: 1,
    });
    const duo = await addChoreography({
      dancerCount: 2,
      groupType: "duo",
      name: "Dúo",
      orderNumber: 2,
    });
    const group = await addChoreography({
      dancerCount: 2,
      groupType: "grupal",
      name: "Grupal",
      orderNumber: 3,
    });

    const rows = await readAcademyPresentations({
      academyId: academy.id,
      eventId: event.id,
    });
    const namesById = new Map(
      rows.map((row) => [row.choreographyId, row.dancerNames]),
    );

    expect(namesById.get(solo.id)).toHaveLength(1);
    expect(namesById.get(duo.id)).toHaveLength(2);
    expect(namesById.get(group.id)).toEqual([]);
  });
});

describe("the event's own answers", () => {
  test("reports whether the event has been ordered at all", async () => {
    const { addAcademy, event } = await seedEvent();
    const { addChoreography } = await addAcademy();

    expect(await hasEventPresentations(event.id)).toBe(false);

    await addChoreography({ name: "Numerada", orderNumber: 1 });

    expect(await hasEventPresentations(event.id)).toBe(true);
  });

  test("reports whether the program was published", async () => {
    const { event } = await seedEvent();

    expect(await isEventProgramVisible(event.id)).toBe(false);

    await db
      .update(events)
      .set({ programVisible: true })
      .where(eq(events.id, event.id));

    expect(await isEventProgramVisible(event.id)).toBe(true);
  });
});
