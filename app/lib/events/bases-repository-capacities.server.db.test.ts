import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographies, scheduleCapacities } from "@/db/schema";
import {
  createScheduleCapacity,
  deleteScheduleCapacity,
  resolveCompatibleScheduleCapacities,
  updateScheduleCapacity,
} from "@/lib/schedules/repository.server";
import { validateInlineScheduleCapacityDependencies } from "@/lib/events/bases-repository/schedule-capacities.server";
import {
  createChoreographyOnBases,
  createEventModalitiesFixture,
  createSavedAcademy,
  createSavedSchedule,
  expectCreated,
} from "@/lib/events/bases-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("`Bases del evento` repository", () => {
  test("keeps schedule capacities unique per group type and inside the schedule total", async () => {
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

  test("resolves compatible schedule capacities by modality and group type", async () => {
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

  test("blocks editing or deleting dependent schedule capacities", async () => {
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
        "No se puede editar el tipo de grupo porque el cupo de cronograma tiene dependencias.",
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

  test("holds an occupied schedule capacity to its group type and its occupied places", async () => {
    const { event, jazz } = await createEventModalitiesFixture();
    const academy = await createSavedAcademy();
    const block = await createSavedSchedule(event.id, {
      modalityIds: [jazz.id],
      totalCapacity: 10,
    });
    const occupiedEntry = await expectCreated(
      createScheduleCapacity(block.id, { groupType: "solo", capacity: 6 }),
    );
    const freeEntry = await expectCreated(
      createScheduleCapacity(block.id, { groupType: "duo", capacity: 4 }),
    );
    const first = await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      scheduleId: block.id,
      scheduleCapacityId: occupiedEntry.id,
    });
    await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      name: "Segunda",
      categoryId: first.categoryId,
      scheduleId: block.id,
      scheduleCapacityId: occupiedEntry.id,
    });

    await expect(
      updateScheduleCapacity(occupiedEntry.id, {
        groupType: "trio",
        capacity: 6,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se puede editar el tipo de grupo porque el cupo de cronograma tiene dependencias.",
    });
    await expect(
      updateScheduleCapacity(occupiedEntry.id, {
        groupType: "solo",
        capacity: 1,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "El cupo no puede ser menor a los 2 lugares ya ocupados.",
      fieldErrors: { capacity: "Ajustá el cupo." },
    });
    await expect(
      updateScheduleCapacity(occupiedEntry.id, {
        groupType: "solo",
        capacity: 2,
      }),
    ).resolves.toMatchObject({ ok: true, record: { capacity: 2 } });
    await expect(
      updateScheduleCapacity(occupiedEntry.id, {
        groupType: "solo",
        capacity: 6,
      }),
    ).resolves.toMatchObject({ ok: true, record: { capacity: 6 } });
    await expect(
      updateScheduleCapacity(freeEntry.id, { groupType: "duo", capacity: 3 }),
    ).resolves.toMatchObject({ ok: true, record: { capacity: 3 } });
  });

  test("counts a choreography as occupying unless it was withdrawn", async () => {
    const { event, jazz } = await createEventModalitiesFixture();
    const academy = await createSavedAcademy();
    const block = await createSavedSchedule(event.id, {
      modalityIds: [jazz.id],
      totalCapacity: 12,
    });
    const withdrawnEntry = await expectCreated(
      createScheduleCapacity(block.id, { groupType: "solo", capacity: 4 }),
    );
    const emptyRosterEntry = await expectCreated(
      createScheduleCapacity(block.id, { groupType: "duo", capacity: 4 }),
    );
    await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      name: "Retirada",
      scheduleCapacityId: withdrawnEntry.id,
      withdrawn: true,
    });
    // Not withdrawn itself, only emptied of dancers: it still holds its place,
    // which is what the single rule now says.
    await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      name: "Sin bailarines",
      groupType: "duo",
      scheduleCapacityId: emptyRosterEntry.id,
      inscriptions: "withdrawn",
    });

    await expect(
      updateScheduleCapacity(withdrawnEntry.id, {
        groupType: "trio",
        capacity: 4,
      }),
    ).resolves.toMatchObject({ ok: true, record: { groupType: "trio" } });
    await expect(
      updateScheduleCapacity(emptyRosterEntry.id, {
        groupType: "grupal",
        capacity: 4,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se puede editar el tipo de grupo porque el cupo de cronograma tiene dependencias.",
    });
  });

  test("refuses removing or restructuring an occupied schedule capacity from the inline path", async () => {
    const { event, jazz } = await createEventModalitiesFixture();
    const academy = await createSavedAcademy();
    const block = await createSavedSchedule(event.id, {
      modalityIds: [jazz.id],
      totalCapacity: 10,
    });
    const occupiedEntry = await expectCreated(
      createScheduleCapacity(block.id, { groupType: "solo", capacity: 6 }),
    );
    const freeEntry = await expectCreated(
      createScheduleCapacity(block.id, { groupType: "duo", capacity: 4 }),
    );
    const first = await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      scheduleCapacityId: occupiedEntry.id,
    });
    await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      name: "Segunda",
      categoryId: first.categoryId,
      scheduleCapacityId: occupiedEntry.id,
    });

    const existingEntries = await db.query.scheduleCapacities.findMany({
      where: eq(scheduleCapacities.scheduleId, block.id),
    });

    await expect(
      validateInlineScheduleCapacityDependencies({
        existingEntries,
        nextEntries: [
          { id: freeEntry.id, index: 0, groupType: "duo", capacity: 4 },
        ],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se puede borrar el cupo de cronograma porque tiene dependencias.",
    });
    await expect(
      validateInlineScheduleCapacityDependencies({
        existingEntries,
        nextEntries: [
          { id: occupiedEntry.id, index: 0, groupType: "grupal", capacity: 6 },
          { id: freeEntry.id, index: 1, groupType: "trio", capacity: 4 },
        ],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se puede editar el tipo de grupo porque el cupo de cronograma tiene dependencias.",
    });
    await expect(
      validateInlineScheduleCapacityDependencies({
        existingEntries,
        nextEntries: [
          { id: freeEntry.id, index: 0, groupType: "duo", capacity: 4 },
          { id: occupiedEntry.id, index: 1, groupType: "solo", capacity: 1 },
        ],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "El cupo no puede ser menor a los 2 lugares ya ocupados.",
      fieldErrors: { "scheduleCapacities.1.capacity": "Ajustá el cupo." },
    });
    await expect(
      validateInlineScheduleCapacityDependencies({
        existingEntries,
        nextEntries: [
          { id: occupiedEntry.id, index: 0, groupType: "solo", capacity: 9 },
          { id: freeEntry.id, index: 1, groupType: "duo", capacity: 1 },
        ],
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      validateInlineScheduleCapacityDependencies({
        existingEntries,
        nextEntries: [
          { id: occupiedEntry.id, index: 0, groupType: "solo", capacity: 6 },
          { id: freeEntry.id, index: 1, groupType: "trio", capacity: 4 },
        ],
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      validateInlineScheduleCapacityDependencies({
        existingEntries,
        nextEntries: [
          { id: occupiedEntry.id, index: 0, groupType: "solo", capacity: 6 },
        ],
      }),
    ).resolves.toEqual({ ok: true });
  });
  test("deletes a schedule capacity only withdrawn choreographies point at and releases their reference", async () => {
    const { event, jazz } = await createEventModalitiesFixture();
    const academy = await createSavedAcademy();
    const block = await createSavedSchedule(event.id, {
      modalityIds: [jazz.id],
      totalCapacity: 10,
    });
    const withdrawnEntry = await expectCreated(
      createScheduleCapacity(block.id, { groupType: "solo", capacity: 6 }),
    );
    const freeEntry = await expectCreated(
      createScheduleCapacity(block.id, { groupType: "duo", capacity: 4 }),
    );
    const withdrawnChoreography = await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      scheduleCapacityId: withdrawnEntry.id,
      withdrawn: true,
    });

    // The entry is free to restructure and free to delete: a withdrawn
    // choreography holds no place in it. The foreign key would still refuse the
    // delete, so the write releases the reference itself.
    await expect(
      updateScheduleCapacity(withdrawnEntry.id, {
        groupType: "solo",
        capacity: 5,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(deleteScheduleCapacity(withdrawnEntry.id)).resolves.toEqual({
      ok: true,
    });
    await expect(deleteScheduleCapacity(freeEntry.id)).resolves.toEqual({
      ok: true,
    });
    await expect(
      db.query.choreographies.findFirst({
        columns: { scheduleCapacityId: true, scheduleId: true },
        where: eq(choreographies.id, withdrawnChoreography.id),
      }),
    ).resolves.toEqual({
      scheduleCapacityId: null,
      scheduleId: block.id,
    });
  });

  test("removes a schedule capacity a withdrawn choreography points at from the inline path", async () => {
    const { event, jazz } = await createEventModalitiesFixture();
    const academy = await createSavedAcademy();
    const block = await createSavedSchedule(event.id, {
      modalityIds: [jazz.id],
      totalCapacity: 10,
    });
    const withdrawnEntry = await expectCreated(
      createScheduleCapacity(block.id, { groupType: "solo", capacity: 6 }),
    );
    await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      scheduleCapacityId: withdrawnEntry.id,
      withdrawn: true,
    });

    const existingEntries = await db.query.scheduleCapacities.findMany({
      where: eq(scheduleCapacities.scheduleId, block.id),
    });

    await expect(
      validateInlineScheduleCapacityDependencies({
        existingEntries,
        nextEntries: [],
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      validateInlineScheduleCapacityDependencies({
        existingEntries,
        nextEntries: [
          { id: withdrawnEntry.id, index: 0, groupType: "duo", capacity: 5 },
        ],
      }),
    ).resolves.toEqual({ ok: true });
  });
});
