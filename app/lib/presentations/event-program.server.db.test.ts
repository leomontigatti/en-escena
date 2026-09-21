import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { events, presentations, schedules } from "@/db/schema";
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
import {
  findPublishedProgramEvent,
  readEventProgram,
} from "@/lib/presentations/event-program.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

async function seedEvent() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const catalog = await createEventCatalog(event.id);

  const addAcademy = async (name: string) => {
    const { academy } = await createAcademyUser({
      academyName: name,
      email: `${crypto.randomUUID()}@example.com`,
    });

    const addChoreography = async (input: {
      dancerCount?: number;
      groupType?: "solo" | "duo" | "trio" | "grupal";
      name: string;
      orderNumber?: number;
      scheduleId?: string;
    }) => {
      const choreography = await createChoreographyRecord({
        academyId: academy.id,
        categoryId: catalog.categoryWithLevel.id,
        eventId: event.id,
        experienceLevelId: catalog.level.id,
        groupType: input.groupType,
        modalityId: catalog.modality.id,
        name: input.name,
        scheduleCapacityId: catalog.scheduleCapacity.id,
        scheduleId: input.scheduleId,
      });

      for (let index = 0; index < (input.dancerCount ?? 1); index += 1) {
        const dancer = await createDancer(academy.id, {
          firstName: `Bailarina${index}`,
        });

        await createSelectedPriceInscriptionForTest({
          academyId: academy.id,
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

    return { academy, addChoreography };
  };

  return { addAcademy, catalog, event };
}

describe("readEventProgram", () => {
  test("returns every presentation in order, whatever its money says", async () => {
    const { addAcademy, event } = await seedEvent();
    const mine = await addAcademy("Academia Norte");
    const theirs = await addAcademy("Academia Sur");
    // None of these rows paid anything: below `Señada` and numbered, they are
    // part of the program all the same, which is what leaves no gap.
    const third = await mine.addChoreography({
      name: "Tercera",
      orderNumber: 3,
    });
    const first = await theirs.addChoreography({
      name: "Primera",
      orderNumber: 1,
    });
    const second = await mine.addChoreography({
      name: "Segunda",
      orderNumber: 2,
    });
    await mine.addChoreography({ name: "Sin número" });

    const program = await readEventProgram(event.id);

    expect(program.rows.map((row) => row.choreographyId)).toEqual([
      first.id,
      second.id,
      third.id,
    ]);
    expect(program.rows.map((row) => row.orderNumber)).toEqual([1, 2, 3]);
    expect(program.rows[0].academyName).toBe("Academia Sur");
    expect(program.rows.every((row) => row.isBelowDeposit)).toBe(false);
  });

  test("leaves out a withdrawn choreography, and lists it again once restored", async () => {
    const { addAcademy, event } = await seedEvent();
    const { addChoreography } = await addAcademy("Academia Norte");
    const performing = await addChoreography({
      name: "En escena",
      orderNumber: 1,
    });
    // A withdrawal drops the presentation, but the program never leans on that
    // to keep a choreography that will not be performed out of print.
    const withdrawn = await addChoreography({
      name: "Retirada",
      orderNumber: 2,
    });

    await withdrawChoreographyForTest(withdrawn.id);

    expect(
      (await readEventProgram(event.id)).rows.map((row) => row.choreographyId),
    ).toEqual([performing.id]);

    await restoreChoreographyForTest(withdrawn.id);

    expect(
      (await readEventProgram(event.id)).rows.map((row) => row.choreographyId),
    ).toEqual([performing.id, withdrawn.id]);
  });

  test("names the dancers of a solo and a duo and of nothing else", async () => {
    const { addAcademy, event } = await seedEvent();
    const { addChoreography } = await addAcademy("Academia Norte");
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
      dancerCount: 3,
      groupType: "grupal",
      name: "Grupal",
      orderNumber: 3,
    });

    const program = await readEventProgram(event.id);
    const namesById = new Map(
      program.rows.map((row) => [row.choreographyId, row.dancerNames]),
    );

    expect(namesById.get(solo.id)).toHaveLength(1);
    expect(namesById.get(duo.id)).toHaveLength(2);
    expect(namesById.get(group.id)).toEqual([]);
  });

  test("lists the schedules that are presented in, in the order they run", async () => {
    const { addAcademy, catalog, event } = await seedEvent();
    const { addChoreography } = await addAcademy("Academia Norte");
    const [afternoon] = await db
      .insert(schedules)
      .values({
        eventId: event.id,
        name: "Sábado tarde",
        scheduledDate: "2026-05-01",
        startTime: "16:00",
        totalCapacity: 10,
      })
      .returning();
    const [emptySchedule] = await db
      .insert(schedules)
      .values({
        eventId: event.id,
        name: "Domingo mañana",
        scheduledDate: "2026-05-02",
        startTime: "10:00",
        totalCapacity: 10,
      })
      .returning();

    await addChoreography({
      name: "Tarde",
      orderNumber: 2,
      scheduleId: afternoon.id,
    });
    await addChoreography({ name: "Mañana", orderNumber: 1 });

    const program = await readEventProgram(event.id);

    expect(program.schedules.map((schedule) => schedule.id)).toEqual([
      catalog.schedule.id,
      afternoon.id,
    ]);
    expect(program.schedules.map((schedule) => schedule.id)).not.toContain(
      emptySchedule.id,
    );
    expect(program.rows[1].scheduleId).toBe(afternoon.id);
  });
});

describe("findPublishedProgramEvent", () => {
  test("answers nothing while the program is not published", async () => {
    const { event } = await seedEvent();

    await db
      .update(events)
      .set({ active: true, programVisible: false })
      .where(eq(events.id, event.id));

    expect(await findPublishedProgramEvent()).toBeNull();
  });

  test("answers nothing when no event is active", async () => {
    const { event } = await seedEvent();

    await db
      .update(events)
      .set({ active: false, programVisible: true })
      .where(eq(events.id, event.id));

    expect(await findPublishedProgramEvent()).toBeNull();
  });

  test("answers the active event and its days once published", async () => {
    const { event } = await seedEvent();

    await db
      .update(events)
      .set({ active: true, programVisible: true })
      .where(eq(events.id, event.id));

    const published = await findPublishedProgramEvent();

    expect(published?.id).toBe(event.id);
    expect(published?.name).toBe(event.name);
    expect(published?.startsOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(published?.endsOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
