import { describe, expect, test } from "vitest";

import { createModality } from "@/lib/modalities/repository.server";
import {
  createSchedule,
  createScheduleWithEntries,
  deleteSchedule,
  listSchedules,
  updateSchedule,
  updateScheduleWithEntries,
} from "@/lib/schedules/repository.server";
import {
  createSavedEvent,
  expectCreated,
} from "@/lib/events/bases-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("Bases del evento repository", () => {
  test("validates cronograma total capacity and accepted modalidades by evento", async () => {
    const firstEvent = await createSavedEvent("Regional 2026");
    const secondEvent = await createSavedEvent("Final 2026");
    const jazz = await expectCreated(
      createModality(firstEvent.id, { name: "Jazz" }),
    );
    const otherEventModality = await expectCreated(
      createModality(secondEvent.id, { name: "Jazz" }),
    );

    await expect(
      createSchedule(firstEvent.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 0,
        modalityIds: [jazz.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { totalCapacity: "Ingresá un cupo total mayor a cero." },
    });
    await expect(
      createSchedule(firstEvent.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [],
      }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: {
        modalityIds: "Este campo es obligatorio.",
      },
    });
    await expect(
      createSchedule(firstEvent.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [otherEventModality.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: {
        modalityIds: "Elegí modalidades del evento activo.",
      },
    });
  });

  test("lists cronogramas with normalized names and allows duplicates inside one evento", async () => {
    const event = await createSavedEvent("Regional 2026");
    const jazz = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const urbanas = await expectCreated(
      createModality(event.id, { name: "Danzas urbanas" }),
    );

    const block = await expectCreated(
      createSchedule(event.id, {
        name: " sábado mañana ",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [jazz.id, urbanas.id],
      }),
    );
    if (!("name" in block)) {
      throw new Error("Expected created schedule to include a name.");
    }
    expect(block.name).toBe("Sábado Mañana");

    await expectCreated(
      createSchedule(event.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "11:00",
        totalCapacity: 15,
        modalityIds: [jazz.id],
      }),
    );

    await expect(listSchedules(event.id)).resolves.toMatchObject([
      expect.objectContaining({
        eventId: event.id,
        name: "Sábado Mañana",
        startTime: "09:00",
        modalityIds: expect.arrayContaining([jazz.id, urbanas.id]),
      }),
      expect.objectContaining({ name: "Sábado Mañana", startTime: "11:00" }),
    ]);
  });

  test("updates cronogramas names while blocking structural edits with dependencies", async () => {
    const event = await createSavedEvent("Regional 2026");
    const jazz = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const urbanas = await expectCreated(
      createModality(event.id, { name: "Danzas urbanas" }),
    );
    const block = await expectCreated(
      createSchedule(event.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [jazz.id, urbanas.id],
      }),
    );

    await expect(
      updateSchedule(
        block.id,
        {
          name: " sábado temprano ",
          scheduledDate: "2026-05-02",
          startTime: "09:00",
          totalCapacity: 20,
          modalityIds: [jazz.id, urbanas.id],
        },
        { hasDependencies: async () => true },
      ),
    ).resolves.toMatchObject({
      ok: true,
      record: { name: "Sábado Temprano" },
    });
    await expect(
      updateSchedule(
        block.id,
        {
          name: "Sábado temprano",
          scheduledDate: "2026-05-02",
          startTime: "10:00",
          totalCapacity: 20,
          modalityIds: [jazz.id, urbanas.id],
        },
        { hasDependencies: async () => true },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se pueden editar fecha, hora, cupo total ni modalidades aceptadas porque el cronograma tiene dependencias.",
    });
    await expect(
      deleteSchedule(block.id, { hasDependencies: async () => true }),
    ).resolves.toMatchObject({
      ok: false,
      error: "No se puede borrar el cronograma porque tiene dependencias.",
    });
  });

  test("manages cronogramas together with cupos inline through the shared Bases del evento listing", async () => {
    const event = await createSavedEvent("Regional 2026");
    const jazz = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const urbanas = await expectCreated(
      createModality(event.id, { name: "Danzas urbanas" }),
    );

    const schedule = await expectCreated(
      createScheduleWithEntries(event.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [jazz.id, urbanas.id],
        scheduleCapacities: [
          { groupType: "solo", capacity: 6 },
          { groupType: "duo", capacity: 8 },
        ],
      }),
    );

    await expect(listSchedules(event.id)).resolves.toMatchObject([
      {
        id: schedule.id,
        modalityIds: expect.arrayContaining([jazz.id, urbanas.id]),
        occupiedCapacity: 14,
        scheduleCapacities: expect.arrayContaining([
          expect.objectContaining({ groupType: "solo", capacity: 6 }),
          expect.objectContaining({ groupType: "duo", capacity: 8 }),
        ]),
      },
    ]);

    const savedSchedule = await listSchedules(event.id);
    const savedEntries =
      savedSchedule.find((entry) => entry.id === schedule.id)
        ?.scheduleCapacities ?? [];
    const soloCapacity = savedEntries.find(
      (entry) => entry.groupType === "solo",
    );

    if (!soloCapacity) {
      throw new Error("Expected solo schedule capacity to exist.");
    }

    await expect(
      updateScheduleWithEntries(schedule.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 24,
        modalityIds: [jazz.id],
        scheduleCapacities: [
          {
            id: soloCapacity.id,
            groupType: "solo",
            capacity: 10,
          },
          {
            groupType: "trio",
            capacity: 4,
          },
        ],
      }),
    ).resolves.toMatchObject({
      ok: true,
      record: { totalCapacity: 24 },
    });

    await expect(listSchedules(event.id)).resolves.toMatchObject([
      {
        id: schedule.id,
        modalityIds: [jazz.id],
        occupiedCapacity: 14,
        scheduleCapacities: [
          expect.objectContaining({ groupType: "solo", capacity: 10 }),
          expect.objectContaining({ groupType: "trio", capacity: 4 }),
        ],
      },
    ]);
  });
});
