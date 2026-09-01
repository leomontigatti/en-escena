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
  createEventModalitiesFixture,
  createSavedEvent,
  createSavedSchedule,
  expectCreated,
} from "@/lib/events/bases-test-fixtures.server.db";
import { createChoreographyRegistration } from "@/lib/choreographies/registration-confirmation.server";
import {
  createAcademySession,
  createDancer,
  createOpenEventCatalog,
  createProfessor,
} from "@/lib/choreographies/registration-test-fixtures.server.db";

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
    const { event, jazz, urbanas } = await createEventModalitiesFixture();

    const block = await createSavedSchedule(event.id, {
      name: " sábado mañana ",
      modalityIds: [jazz.id, urbanas.id],
    });
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
    const { event, jazz, urbanas } = await createEventModalitiesFixture();
    const block = await createSavedSchedule(event.id, {
      modalityIds: [jazz.id, urbanas.id],
    });

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
    const { event, jazz, urbanas } = await createEventModalitiesFixture();

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
        availablePlaces: 20,
        occupiedCount: 0,
        scheduleCapacities: expect.arrayContaining([
          expect.objectContaining({
            groupType: "solo",
            capacity: 6,
            availablePlaces: 6,
            occupiedCount: 0,
          }),
          expect.objectContaining({
            groupType: "duo",
            capacity: 8,
            availablePlaces: 8,
            occupiedCount: 0,
          }),
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
        availablePlaces: 24,
        occupiedCount: 0,
        scheduleCapacities: [
          expect.objectContaining({
            groupType: "solo",
            capacity: 10,
            availablePlaces: 10,
          }),
          expect.objectContaining({
            groupType: "trio",
            capacity: 4,
            availablePlaces: 4,
          }),
        ],
      },
    ]);
  });

  // La lista de Administración planifica sobre lo que queda, así que la
  // ocupación tiene que ser la real —coreografías asignadas— y no la suma de
  // los cupos divididos, que solo reparte el cupo total.
  test("reports the lugares disponibles left by the coreografias already assigned", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Lugares Disponibles",
      email: "lugares.disponibles@example.com",
    });
    const { event, catalog } = await createOpenEventCatalog();
    const dancer = await createDancer(owner.academyId, {
      birthDate: "2014-05-01",
    });
    const professor = await createProfessor(owner.academyId);
    const registration = await createChoreographyRegistration({
      academyId: owner.academyId,
      dancerIds: [dancer.id],
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Pieza ocupante",
      professorIds: [professor.id],
      scheduleCapacityId: catalog.soloScheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    if (!registration.ok) {
      throw new Error(`Unexpected registration failure: ${registration.error}`);
    }

    const eventSchedules = await listSchedules(event.id);
    const schedule = eventSchedules.find(
      (candidate) => candidate.id === catalog.schedule.id,
    );

    expect(schedule).toMatchObject({
      totalCapacity: 10,
      occupiedCount: 1,
      availablePlaces: 9,
    });
    expect(
      schedule?.scheduleCapacities.find(
        (scheduleCapacity) =>
          scheduleCapacity.id === catalog.soloScheduleCapacity.id,
      ),
    ).toMatchObject({
      capacity: 5,
      occupiedCount: 1,
      availablePlaces: 4,
    });
  });
});
