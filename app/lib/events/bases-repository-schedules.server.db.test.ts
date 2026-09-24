import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { schedules } from "@/db/schema";

import {
  createCategory,
  deleteCategory,
} from "@/lib/categories/repository.server";
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
  createChoreographyOnBases,
  createEventModalitiesFixture,
  createSavedAcademy,
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

describe("`Bases del evento` repository", () => {
  test("validates schedule total capacity and accepted modalities by event", async () => {
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

  test("accepts categories that share a modality with the schedule, and none at all", async () => {
    const { event, jazz, urbanas } = await createEventModalitiesFixture();
    const otherEvent = await createSavedEvent("Final 2026");
    const otherEventModality = await expectCreated(
      createModality(otherEvent.id, { name: "Jazz" }),
    );
    const babyJazz = await createSavedCategory(event.id, {
      name: "Baby",
      modalityIds: [jazz.id],
    });
    const juvenilUrbanas = await createSavedCategory(event.id, {
      name: "Juvenil",
      modalityIds: [urbanas.id],
    });
    const otherEventCategory = await createSavedCategory(otherEvent.id, {
      name: "Baby",
      modalityIds: [otherEventModality.id],
    });

    const unrestricted = await expectCreated(
      createSchedule(event.id, {
        name: "Función única",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [jazz.id],
      }),
    );
    const firstShow = await expectCreated(
      createSchedule(event.id, {
        name: "Función 1",
        scheduledDate: "2026-05-02",
        startTime: "11:00",
        totalCapacity: 20,
        modalityIds: [jazz.id],
        categoryIds: [babyJazz.id],
      }),
    );

    await expect(
      createSchedule(event.id, {
        name: "Función 2",
        scheduledDate: "2026-05-02",
        startTime: "13:00",
        totalCapacity: 20,
        modalityIds: [jazz.id],
        categoryIds: [juvenilUrbanas.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: {
        categoryIds:
          "Elegí categorías que compartan una modalidad con el cronograma.",
      },
    });
    await expect(
      createSchedule(event.id, {
        name: "Función 2",
        scheduledDate: "2026-05-02",
        startTime: "13:00",
        totalCapacity: 20,
        modalityIds: [jazz.id],
        categoryIds: [otherEventCategory.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: {
        categoryIds:
          "Elegí categorías que compartan una modalidad con el cronograma.",
      },
    });

    await expect(listSchedules(event.id)).resolves.toMatchObject([
      expect.objectContaining({ id: unrestricted.id, categoryIds: [] }),
      expect.objectContaining({
        id: firstShow.id,
        categoryIds: [babyJazz.id],
        categories: [expect.objectContaining({ name: "Baby" })],
      }),
    ]);
  });

  // The categories of a schedule are validated against the modalities being
  // saved, not the ones that were saved before: narrowing the modalities has to
  // re-check the categories that are already listed.
  test("re-validates the accepted categories when the schedule's modalities change", async () => {
    const { event, jazz, urbanas } = await createEventModalitiesFixture();
    const babyJazz = await createSavedCategory(event.id, {
      name: "Baby",
      modalityIds: [jazz.id],
    });
    const schedule = await expectCreated(
      createSchedule(event.id, {
        name: "Función 1",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [jazz.id, urbanas.id],
        categoryIds: [babyJazz.id],
      }),
    );

    await expect(
      updateSchedule(schedule.id, {
        name: "Función 1",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [urbanas.id],
        categoryIds: [babyJazz.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: {
        categoryIds:
          "Elegí categorías que compartan una modalidad con el cronograma.",
      },
    });
    await expect(
      updateScheduleWithEntries(schedule.id, {
        name: "Función 1",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [jazz.id],
        categoryIds: [],
        scheduleCapacities: [],
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(listSchedules(event.id)).resolves.toMatchObject([
      expect.objectContaining({ id: schedule.id, categoryIds: [] }),
    ]);
  });

  // A cascade would empty the list and silently turn a restricted schedule into
  // one that accepts every category, so the delete is refused instead.
  test("refuses to delete a category that a schedule lists", async () => {
    const { event, jazz } = await createEventModalitiesFixture();
    const babyJazz = await createSavedCategory(event.id, {
      name: "Baby",
      modalityIds: [jazz.id],
    });
    const schedule = await expectCreated(
      createSchedule(event.id, {
        name: "Función 1",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [jazz.id],
        categoryIds: [babyJazz.id],
      }),
    );

    await expect(deleteCategory(babyJazz.id)).resolves.toMatchObject({
      ok: false,
      error:
        "No se puede borrar la categoría porque tiene cronogramas relacionados.",
    });

    await expectCreated(
      updateSchedule(schedule.id, {
        name: "Función 1",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [jazz.id],
        categoryIds: [],
      }),
    );

    await expect(deleteCategory(babyJazz.id)).resolves.toMatchObject({
      ok: true,
    });
  });

  test("lists schedules with normalized names and allows duplicates inside one event", async () => {
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

  test("updates schedules names while blocking structural edits with dependencies", async () => {
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
        "No se pueden editar fecha, hora ni modalidades aceptadas porque el cronograma tiene dependencias.",
    });
    await expect(
      deleteSchedule(block.id, { hasDependencies: async () => true }),
    ).resolves.toMatchObject({
      ok: false,
      error: "No se puede borrar el cronograma porque tiene dependencias.",
    });
  });

  test("manages schedules together with capacities inline through the shared `Bases del evento` listing", async () => {
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

  // The `Administración` list plans against what is left, so occupancy has to be
  // the real one — assigned choreographies — and not the sum of the split
  // capacities, which only shares out the total capacity.
  test("reports the lugares available left by the choreographies already assigned", async () => {
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

  test("refuses restructuring a schedule that carries choreographies without a schedule price", async () => {
    const { event, jazz, urbanas } = await createEventModalitiesFixture();
    const academy = await createSavedAcademy();
    const occupiedBlock = await createSavedSchedule(event.id, {
      modalityIds: [jazz.id],
      totalCapacity: 20,
    });
    const freeBlock = await createSavedSchedule(event.id, {
      name: "Sábado tarde",
      startTime: "14:00",
      modalityIds: [jazz.id],
      totalCapacity: 20,
    });
    const first = await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      scheduleId: occupiedBlock.id,
    });

    await expect(
      updateSchedule(occupiedBlock.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [jazz.id, urbanas.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se pueden editar fecha, hora ni modalidades aceptadas porque el cronograma tiene dependencias.",
    });
    await expect(
      updateSchedule(occupiedBlock.id, {
        name: "Sábado temprano",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [jazz.id],
      }),
    ).resolves.toMatchObject({ ok: true, record: { name: "Sábado Temprano" } });
    await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      name: "Segunda",
      categoryId: first.categoryId,
      scheduleId: occupiedBlock.id,
    });
    await expect(
      updateSchedule(occupiedBlock.id, {
        name: "Sábado temprano",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 1,
        modalityIds: [jazz.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "El cupo total no puede ser menor a los 2 lugares ya ocupados del cronograma.",
      fieldErrors: { totalCapacity: "Ajustá el cupo." },
    });
    await expect(
      updateSchedule(occupiedBlock.id, {
        name: "Sábado temprano",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 30,
        modalityIds: [jazz.id],
      }),
    ).resolves.toMatchObject({ ok: true, record: { totalCapacity: 30 } });
    await expect(
      updateSchedule(freeBlock.id, {
        name: "Sábado tarde",
        scheduledDate: "2026-05-02",
        startTime: "15:00",
        totalCapacity: 18,
        modalityIds: [jazz.id, urbanas.id],
      }),
    ).resolves.toMatchObject({ ok: true, record: { totalCapacity: 18 } });
  });
  // Accepted categories follow the total capacity precedent rather than the
  // frozen date, time and modalities: they may change freely as long as the
  // schedule still accepts what occupies it. That is what lets an administrator
  // turn an existing schedule into "Función 1" after moving the older
  // choreographies to the second show.
  test("refuses excluding a category an occupying choreography has", async () => {
    const { event, jazz } = await createEventModalitiesFixture();
    const academy = await createSavedAcademy();
    const baby = await createSavedCategory(event.id, {
      name: "Baby",
      modalityIds: [jazz.id],
      minAge: 4,
      maxAge: 6,
    });
    const juvenil = await createSavedCategory(event.id, {
      name: "Juvenil",
      modalityIds: [jazz.id],
      minAge: 13,
      maxAge: 17,
    });
    const show = await createSavedSchedule(event.id, {
      modalityIds: [jazz.id],
    });
    const narrowTo = (categoryIds: string[]) =>
      updateSchedule(show.id, {
        name: "Función 1",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [jazz.id],
        categoryIds,
      });

    await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      categoryId: juvenil.id,
      scheduleId: show.id,
    });
    await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      name: "Retirada",
      categoryId: baby.id,
      scheduleId: show.id,
      withdrawn: true,
    });

    // The date, the time and the modalities are frozen by the occupying
    // choreography, but the categories are not: listing both, or listing only
    // the occupant's, goes through.
    await expect(narrowTo([baby.id, juvenil.id])).resolves.toMatchObject({
      ok: true,
    });
    await expect(narrowTo([juvenil.id])).resolves.toMatchObject({ ok: true });
    await expect(listSchedules(event.id)).resolves.toMatchObject([
      expect.objectContaining({ id: show.id, categoryIds: [juvenil.id] }),
    ]);

    // The withdrawn choreography's category is left out without a word; the
    // occupying one's cannot be.
    await expect(narrowTo([baby.id])).resolves.toMatchObject({
      ok: false,
      code: "schedule-has-dependencies",
      error:
        "No se pueden excluir categorías con coreografías asignadas al cronograma: Juvenil.",
    });
    await expect(narrowTo([])).resolves.toMatchObject({ ok: true });
    await expect(
      updateScheduleWithEntries(show.id, {
        name: "Función 1",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [jazz.id],
        categoryIds: [baby.id],
        scheduleCapacities: [],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se pueden excluir categorías con coreografías asignadas al cronograma: Juvenil.",
    });
  });

  test("reports deleting a schedule any choreography points at as a dependency failure", async () => {
    const { event, jazz } = await createEventModalitiesFixture();
    const academy = await createSavedAcademy();
    const withdrawnBlock = await createSavedSchedule(event.id, {
      modalityIds: [jazz.id],
      totalCapacity: 20,
    });
    const freeBlock = await createSavedSchedule(event.id, {
      name: "Sábado tarde",
      startTime: "14:00",
      modalityIds: [jazz.id],
      totalCapacity: 20,
    });
    await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      scheduleId: withdrawnBlock.id,
      withdrawn: true,
    });

    // Restructuring the block is free —the choreography on it is withdrawn, so
    // it holds no place— but deleting it is not: `choreography.schedule_id` is
    // not nullable, so the reference cannot be released the way the capacity's
    // is, the foreign key refuses, and the guard reports that.
    await expect(
      updateSchedule(withdrawnBlock.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:30",
        totalCapacity: 18,
        modalityIds: [jazz.id],
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(deleteSchedule(withdrawnBlock.id)).resolves.toEqual({
      ok: false,
      code: "schedule-has-dependencies",
      error:
        "No se puede borrar el cronograma porque tiene coreografías retiradas asignadas.",
    });
    await expect(deleteSchedule(freeBlock.id)).resolves.toEqual({ ok: true });
  });
  test("refuses restructuring a schedule whose choreography carries no inscription", async () => {
    const { event, jazz, urbanas } = await createEventModalitiesFixture();
    const academy = await createSavedAcademy();
    const block = await createSavedSchedule(event.id, {
      modalityIds: [jazz.id],
      totalCapacity: 20,
    });
    await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      scheduleId: block.id,
      inscriptions: "none",
    });

    await expect(
      updateSchedule(block.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [jazz.id, urbanas.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se pueden editar fecha, hora ni modalidades aceptadas porque el cronograma tiene dependencias.",
    });
  });
  // The switch is the administrator's and nobody else's: the repository never
  // sets it, so a new schedule is born closed and an edit of anything else
  // leaves it exactly where it was. Opening it is #1157's action.
  test("creates schedules closed and leaves the switch alone on every edit", async () => {
    const { event, jazz, urbanas } = await createEventModalitiesFixture();

    const closed = await expectCreated(
      createSchedule(event.id, {
        name: "Función 1",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [jazz.id],
      }),
    );
    const withEntries = await expectCreated(
      createScheduleWithEntries(event.id, {
        name: "Función 2",
        scheduledDate: "2026-05-02",
        startTime: "11:00",
        totalCapacity: 20,
        modalityIds: [jazz.id],
        categoryIds: [],
        scheduleCapacities: [],
      }),
    );

    expect(closed).toMatchObject({ registrationOpen: false });
    expect(withEntries).toMatchObject({ registrationOpen: false });

    // Opened the only way there is for now, so that the edits below have
    // something to preserve.
    await db
      .update(schedules)
      .set({ registrationOpen: true })
      .where(eq(schedules.id, closed.id));

    await expect(
      updateSchedule(closed.id, {
        name: "Función 1",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 30,
        modalityIds: [jazz.id, urbanas.id],
      }),
    ).resolves.toMatchObject({ ok: true, record: { registrationOpen: true } });
    await expect(
      updateScheduleWithEntries(closed.id, {
        name: "Función 1",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 30,
        modalityIds: [jazz.id, urbanas.id],
        categoryIds: [],
        scheduleCapacities: [],
      }),
    ).resolves.toMatchObject({ ok: true, record: { registrationOpen: true } });
    await expect(listSchedules(event.id)).resolves.toMatchObject([
      expect.objectContaining({ id: closed.id, registrationOpen: true }),
      expect.objectContaining({ id: withEntries.id, registrationOpen: false }),
    ]);
  });
});

async function createSavedCategory(
  eventId: string,
  {
    name,
    modalityIds,
    minAge = 1,
    maxAge = 100,
  }: {
    name: string;
    modalityIds: string[];
    minAge?: number;
    maxAge?: number;
  },
) {
  return await expectCreated(
    createCategory(eventId, {
      name,
      minAge,
      maxAge,
      groupTypes: ["solo"],
      modalityIds,
      experienceLevels: [],
    }),
  );
}
