import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { scheduleCapacities } from "@/db/schema";
import {
  createScheduleCapacity,
  deleteScheduleCapacity,
  resolveCompatibleScheduleCapacities,
  updateScheduleCapacity,
} from "@/lib/schedules/repository.server";
import {
  createEventModalitiesFixture,
  createSavedSchedule,
  expectCreated,
} from "@/lib/events/bases-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("Bases del evento repository", () => {
  test("keeps cupos de cronograma unique per group type and inside the cronograma total", async () => {
    const { event, jazz } = await createEventModalitiesFixture();
    const block = await createSavedSchedule(event.id, {
      modalityIds: [jazz.id],
      totalCapacity: 10,
    });
    const otherBlock = await createSavedSchedule(event.id, {
      name: "Sábado tarde",
      startTime: "14:00",
      totalCapacity: 8,
      modalityIds: [jazz.id],
    });

    await expectCreated(
      createScheduleCapacity(block.id, {
        groupType: "solo",
        capacity: 6,
      }),
    );
    await expect(
      createScheduleCapacity(block.id, {
        groupType: "solo",
        capacity: 2,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "Ya existe un cupo de cronograma para ese tipo de grupo en este cronograma.",
      fieldErrors: {
        groupType: "Revisá el tipo de grupo del cupo de cronograma.",
      },
    });
    await expect(
      createScheduleCapacity(block.id, {
        groupType: "duo",
        capacity: 5,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "La suma de cupos de cronograma no puede superar el cupo total del cronograma.",
      fieldErrors: { capacity: "Ajustá el cupo." },
    });
    await expectCreated(
      createScheduleCapacity(otherBlock.id, {
        groupType: "solo",
        capacity: 3,
      }),
    );
  });

  test("resolves compatible cupos de cronograma by modalidad and group type", async () => {
    const { event, jazz, urbanas } = await createEventModalitiesFixture();
    const block = await createSavedSchedule(event.id, {
      modalityIds: [jazz.id],
      totalCapacity: 10,
    });
    const otherBlock = await createSavedSchedule(event.id, {
      name: "Sábado tarde",
      startTime: "14:00",
      totalCapacity: 8,
      modalityIds: [jazz.id],
    });
    const soloSchedule = await expectCreated(
      createScheduleCapacity(block.id, {
        groupType: "solo",
        capacity: 6,
      }),
    );
    await expectCreated(
      createScheduleCapacity(otherBlock.id, {
        groupType: "solo",
        capacity: 3,
      }),
    );

    await expect(
      resolveCompatibleScheduleCapacities({
        eventId: event.id,
        modalityId: urbanas.id,
        groupType: "solo",
      }),
    ).resolves.toMatchObject({
      status: "none",
      error:
        "No hay cupos de cronograma compatibles para la modalidad y el tipo de grupo seleccionados.",
    });
    await expect(
      resolveCompatibleScheduleCapacities({
        eventId: event.id,
        modalityId: jazz.id,
        groupType: "solo",
      }),
    ).resolves.toMatchObject({
      status: "multiple",
      options: expect.arrayContaining([
        expect.objectContaining({ id: soloSchedule.id }),
      ]),
    });
  });

  test("blocks editing or deleting dependent cupos de cronograma", async () => {
    const { event, jazz } = await createEventModalitiesFixture();
    const block = await createSavedSchedule(event.id, {
      modalityIds: [jazz.id],
      totalCapacity: 10,
    });
    const soloSchedule = await expectCreated(
      createScheduleCapacity(block.id, {
        groupType: "solo",
        capacity: 6,
      }),
    );

    await expect(
      updateScheduleCapacity(
        soloSchedule.id,
        { groupType: "duo", capacity: 6 },
        { hasDependencies: async () => true },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se pueden editar tipos de grupo ni cupo porque el cupo de cronograma tiene dependencias.",
    });
    await expect(
      deleteScheduleCapacity(soloSchedule.id, {
        hasDependencies: async () => true,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se puede borrar el cupo de cronograma porque tiene dependencias.",
    });

    const savedSchedule = await db.query.scheduleCapacities.findFirst({
      where: eq(scheduleCapacities.id, soloSchedule.id),
    });
    expect(savedSchedule).toMatchObject({ capacity: 6, groupType: "solo" });
  });
});
