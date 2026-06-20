import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { scheduleCapacities, submodalities } from "@/db/schema";
import {
  createCategory,
  createExperienceLevel,
  createModality,
  createPrice,
  createScheduleCapacity,
  createSchedule,
  createSubmodality,
  deleteCategory,
  deleteExperienceLevel,
  deleteModality,
  deletePrice,
  deleteScheduleCapacity,
  deleteSchedule,
  deleteSubmodality,
  listEventBasesData,
  resolveApplicablePrice,
  resolveCompatibleScheduleCapacities,
  updateCategory,
  updateExperienceLevel,
  updateModality,
  updatePrice,
  updateScheduleCapacity,
  updateSchedule,
  updateSubmodality,
} from "@/lib/events/bases-repository.server";
import { createEvent } from "@/lib/events/management.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("Bases del evento repository", () => {
  test("keeps modalidad names unique inside one evento only", async () => {
    const firstEvent = await createSavedEvent("Regional 2026");
    const secondEvent = await createSavedEvent("Final 2026");

    await expect(
      createModality(firstEvent.id, { name: " jazz contemporáneo " }),
    ).resolves.toMatchObject({
      ok: true,
      record: { name: "Jazz Contemporáneo" },
    });
    await expect(
      createModality(secondEvent.id, { name: "Jazz Contemporáneo" }),
    ).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      createModality(firstEvent.id, { name: " jazz contemporaneo " }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Ya existe una modalidad con ese nombre en este evento.",
      fieldErrors: { name: "Usá un nombre distinto para la modalidad." },
    });
  });

  test("manages submodalidades under a modalidad and blocks deleting the parent while they exist", async () => {
    const event = await createSavedEvent("Regional 2026");
    const modality = await expectCreated(
      createModality(event.id, { name: "Danzas urbanas" }),
    );
    const otherModality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );

    const submodality = await expectCreated(
      createSubmodality(event.id, {
        modalityId: modality.id,
        name: " hip hop ",
      }),
    );
    const savedCreatedSubmodality = await db.query.submodalities.findFirst({
      where: eq(submodalities.id, submodality.id),
    });
    expect(savedCreatedSubmodality).toMatchObject({ name: "Hip Hop" });
    await expect(
      createSubmodality(event.id, {
        modalityId: otherModality.id,
        name: "Hip hop",
      }),
    ).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      createSubmodality(event.id, {
        modalityId: modality.id,
        name: " hip HÓP ",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Ya existe una submodalidad con ese nombre en esta modalidad.",
      fieldErrors: { name: "Usá un nombre distinto para la submodalidad." },
    });
    await expect(deleteModality(modality.id)).resolves.toMatchObject({
      ok: false,
      error:
        "No se puede borrar la modalidad porque tiene submodalidades relacionadas.",
    });

    await expect(deleteSubmodality(submodality.id)).resolves.toEqual({
      ok: true,
    });
    await expect(deleteModality(modality.id)).resolves.toEqual({ ok: true });
  });

  test("rejects a submodalidad assigned to a modalidad from another evento", async () => {
    const firstEvent = await createSavedEvent("Regional 2026");
    const secondEvent = await createSavedEvent("Final 2026");
    const firstModality = await expectCreated(
      createModality(firstEvent.id, { name: "Jazz" }),
    );

    await expect(
      createSubmodality(secondEvent.id, {
        modalityId: firstModality.id,
        name: "Jazz funk",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Elegí una modalidad del evento activo.",
      fieldErrors: { modalityId: "Elegí una modalidad del evento activo." },
    });
  });

  test("keeps nivel de experiencia names unique inside one evento only", async () => {
    const firstEvent = await createSavedEvent("Regional 2026");
    const secondEvent = await createSavedEvent("Final 2026");

    const level = await expectCreated(
      createExperienceLevel(firstEvent.id, { name: "Inicial" }),
    );

    await expect(
      createExperienceLevel(secondEvent.id, { name: "Inicial" }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      createExperienceLevel(firstEvent.id, { name: " inicial " }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Ya existe un nivel de experiencia con ese nombre en este evento.",
      fieldErrors: {
        name: "Usá un nombre distinto para el nivel de experiencia.",
      },
    });
    await expect(
      updateExperienceLevel(level.id, { name: "Principiante" }),
    ).resolves.toMatchObject({ ok: true, record: { name: "Principiante" } });
  });

  test("updates Bases del evento labels while preserving event-scoped uniqueness", async () => {
    const event = await createSavedEvent("Regional 2026");
    const modality = await expectCreated(
      createModality(event.id, { name: "Danzas urbanas" }),
    );
    await expectCreated(createModality(event.id, { name: "Jazz" }));
    const submodality = await expectCreated(
      createSubmodality(event.id, {
        modalityId: modality.id,
        name: "Hip hop",
      }),
    );
    await expectCreated(
      createSubmodality(event.id, {
        modalityId: modality.id,
        name: "Jazz funk",
      }),
    );

    await expect(
      updateModality(modality.id, { name: "Urbanas" }),
    ).resolves.toMatchObject({
      ok: true,
      record: { name: "Urbanas" },
    });
    await expect(
      updateSubmodality(submodality.id, {
        modalityId: modality.id,
        name: "Jazz funk",
      }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { name: "Usá un nombre distinto para la submodalidad." },
    });

    const savedSubmodality = await db.query.submodalities.findFirst({
      where: eq(submodalities.id, submodality.id),
    });
    expect(savedSubmodality).toMatchObject({ name: "Hip Hop" });
  });

  test("manages categorías with event-scoped uniqueness, optional levels and overlap validation", async () => {
    const firstEvent = await createSavedEvent("Regional 2026");
    const secondEvent = await createSavedEvent("Final 2026");
    const firstModality = await expectCreated(
      createModality(firstEvent.id, { name: "Jazz" }),
    );
    const otherFirstModality = await expectCreated(
      createModality(firstEvent.id, { name: "Contemporáneo" }),
    );
    const secondModality = await expectCreated(
      createModality(secondEvent.id, { name: "Jazz" }),
    );
    const firstLevel = await expectCreated(
      createExperienceLevel(firstEvent.id, { name: "Inicial" }),
    );
    const secondLevel = await expectCreated(
      createExperienceLevel(secondEvent.id, { name: "Inicial" }),
    );

    const category = await expectCreated(
      createCategory(firstEvent.id, {
        name: " infantil ",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["solo", "duo"],
        modalityIds: [firstModality.id],
        experienceLevelIds: [],
      }),
    );
    expect(category.name).toBe("Infantil");
    await expect(
      createCategory(secondEvent.id, {
        name: "Infantil",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["duo", "solo"],
        modalityIds: [secondModality.id],
        experienceLevelIds: [],
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      createCategory(firstEvent.id, {
        name: "Infantil Contemporáneo",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["duo", "solo"],
        modalityIds: [otherFirstModality.id],
        experienceLevelIds: [],
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      createCategory(firstEvent.id, {
        name: "Mini",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["duo", "solo"],
        modalityIds: [firstModality.id],
        experienceLevelIds: [firstLevel.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "Ya existe una categoría con ese rango de edad, tipos de grupo y modalidades.",
      fieldErrors: {},
    });
    await expect(
      createCategory(firstEvent.id, {
        name: "Pre juvenil",
        minAge: 10,
        maxAge: 14,
        groupTypes: ["solo"],
        modalityIds: [firstModality.id],
        experienceLevelIds: [firstLevel.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "La categoría se solapa con otra categoría para la misma modalidad y tipo de grupo.",
      fieldErrors: {},
    });
    await expect(
      createCategory(firstEvent.id, {
        name: "Juvenil",
        minAge: 13,
        maxAge: 17,
        groupTypes: ["solo"],
        modalityIds: [firstModality.id],
        experienceLevelIds: [secondLevel.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Elegí niveles de experiencia del evento activo.",
      fieldErrors: {
        experienceLevelIds: "Elegí niveles de experiencia del evento activo.",
      },
    });

    await expect(
      updateCategory(category.id, {
        name: " infantil a ",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["solo", "duo"],
        modalityIds: [firstModality.id],
        experienceLevelIds: [],
      }),
    ).resolves.toMatchObject({
      ok: true,
      record: { name: "Infantil A" },
    });
    await expect(deleteExperienceLevel(firstLevel.id)).resolves.toEqual({
      ok: true,
    });
    await expect(deleteModality(firstModality.id)).resolves.toMatchObject({
      ok: false,
      error:
        "No se puede borrar la modalidad porque tiene categorías relacionadas.",
    });
    await expect(deleteCategory(category.id)).resolves.toEqual({ ok: true });
    await expect(deleteModality(firstModality.id)).resolves.toEqual({
      ok: true,
    });
  });

  test("manages cronogramas with event-scoped modalidades, cupo validation and dependency guardrails", async () => {
    const firstEvent = await createSavedEvent("Regional 2026");
    const secondEvent = await createSavedEvent("Final 2026");
    const jazz = await expectCreated(
      createModality(firstEvent.id, { name: "Jazz" }),
    );
    const urbanas = await expectCreated(
      createModality(firstEvent.id, { name: "Danzas urbanas" }),
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

    const block = await expectCreated(
      createSchedule(firstEvent.id, {
        name: " sábado mañana ",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [jazz.id, urbanas.id],
      }),
    );
    expect(block.name).toBe("Sábado Mañana");
    await expectCreated(
      createSchedule(secondEvent.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-06-02",
        startTime: "11:00",
        totalCapacity: 10,
        modalityIds: [otherEventModality.id],
      }),
    );

    await expect(listEventBasesData(firstEvent.id)).resolves.toMatchObject({
      schedules: [
        {
          eventId: firstEvent.id,
          name: "Sábado Mañana",
          modalityIds: expect.arrayContaining([jazz.id, urbanas.id]),
        },
      ],
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

  test("manages precios with event-scoped uniqueness, resolution precedence and dependency guardrails", async () => {
    const firstEvent = await createSavedEvent("Regional 2026");
    const secondEvent = await createSavedEvent("Final 2026");
    const jazz = await expectCreated(
      createModality(firstEvent.id, { name: "Jazz" }),
    );
    const otherEventModality = await expectCreated(
      createModality(secondEvent.id, { name: "Jazz" }),
    );
    const block = await expectCreated(
      createSchedule(firstEvent.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [jazz.id],
      }),
    );
    const otherEventBlock = await expectCreated(
      createSchedule(secondEvent.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-06-02",
        startTime: "11:00",
        totalCapacity: 10,
        modalityIds: [otherEventModality.id],
      }),
    );

    const general = await expectCreated(
      createPrice(firstEvent.id, {
        groupType: "solo",
        amount: 12000,
        paymentDeadline: "2026-05-31",
        scheduleId: null,
      }),
    );
    const specific = await expectCreated(
      createPrice(firstEvent.id, {
        groupType: "solo",
        amount: 15000,
        paymentDeadline: "2026-05-31",
        scheduleId: block.id,
      }),
    );
    await expect(deleteSchedule(block.id)).resolves.toMatchObject({
      ok: false,
      error: "No se puede borrar el cronograma porque tiene dependencias.",
    });
    await expect(
      createPrice(secondEvent.id, {
        groupType: "solo",
        amount: 9000,
        paymentDeadline: "2026-06-30",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      createPrice(firstEvent.id, {
        groupType: "solo",
        amount: 13000,
        paymentDeadline: "2026-05-31",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Ya existe un precio general para ese tipo de grupo.",
      fieldErrors: { groupType: "Revisá el tipo de grupo del precio." },
    });
    await expect(
      createPrice(firstEvent.id, {
        groupType: "solo",
        amount: 13000,
        paymentDeadline: "2026-05-31",
        scheduleId: otherEventBlock.id,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Elegí un cronograma del evento activo.",
      fieldErrors: {
        scheduleId: "Elegí un cronograma del evento activo.",
      },
    });

    await expect(
      resolveApplicablePrice({
        eventId: firstEvent.id,
        groupType: "solo",
        scheduleId: block.id,
      }),
    ).resolves.toMatchObject({
      ok: true,
      price: { id: specific.id, amount: 15000 },
    });
    const laterGeneral = await expectCreated(
      createPrice(firstEvent.id, {
        groupType: "solo",
        amount: 17000,
        paymentDeadline: "2026-06-30",
        scheduleId: null,
      }),
    );
    await expect(
      resolveApplicablePrice({
        eventId: firstEvent.id,
        groupType: "solo",
        paymentDate: "2026-06-10",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({
      ok: true,
      price: { id: laterGeneral.id, amount: 17000 },
    });
    await expect(
      resolveApplicablePrice({
        eventId: firstEvent.id,
        groupType: "solo",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({
      ok: true,
      price: { id: general.id, amount: 12000 },
    });
    await expect(
      resolveApplicablePrice({
        eventId: firstEvent.id,
        groupType: "duo",
        scheduleId: block.id,
      }),
    ).resolves.toEqual({
      ok: false,
      code: "missing-price",
      error:
        "No hay un precio configurado para este tipo de grupo y cronograma.",
    });

    await expect(listEventBasesData(firstEvent.id)).resolves.toMatchObject({
      prices: [
        {
          eventId: firstEvent.id,
          paymentDeadline: "2026-05-31",
          schedule: { name: "Sábado Mañana" },
        },
        {
          eventId: firstEvent.id,
          paymentDeadline: "2026-05-31",
          schedule: null,
        },
        {
          eventId: firstEvent.id,
          paymentDeadline: "2026-06-30",
          schedule: null,
        },
      ],
    });

    await expect(
      updatePrice(
        general.id,
        {
          groupType: "solo",
          amount: 12000,
          paymentDeadline: "2026-05-31",
          scheduleId: null,
        },
        { hasDependencies: async () => true },
      ),
    ).resolves.toMatchObject({
      ok: true,
      record: { amount: 12000 },
    });
    await expect(
      updatePrice(
        general.id,
        {
          groupType: "solo",
          amount: 14000,
          paymentDeadline: "2026-05-31",
          scheduleId: null,
        },
        { hasDependencies: async () => true },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se pueden editar monto, tipo de grupo ni cronograma porque el precio tiene dependencias.",
    });
    await expect(
      deletePrice(general.id, { hasDependencies: async () => true }),
    ).resolves.toMatchObject({
      ok: false,
      error: "No se puede borrar el precio porque tiene dependencias.",
    });
  });

  test("manages cupos de cronograma with unique group types, block cupo limits and compatibility resolution", async () => {
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
        totalCapacity: 10,
        modalityIds: [jazz.id],
      }),
    );
    const otherBlock = await expectCreated(
      createSchedule(event.id, {
        name: "Sábado tarde",
        scheduledDate: "2026-05-02",
        startTime: "14:00",
        totalCapacity: 8,
        modalityIds: [jazz.id],
      }),
    );

    const soloSchedule = await expectCreated(
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

async function createSavedEvent(name: string) {
  const result = await createEvent({
    name,
    registrationStartsAt: new Date("2026-03-01T12:00:00Z"),
    registrationEndsAt: new Date("2026-04-30T12:00:00Z"),
    startsAt: new Date("2026-05-01T12:00:00Z"),
    endsAt: new Date("2026-05-03T12:00:00Z"),
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.event;
}

async function expectCreated(
  resultPromise: Promise<{
    ok: boolean;
    record?: { id: string };
  }>,
) {
  const result = await resultPromise;

  if (!result.ok || !result.record) {
    throw new Error("Expected Bases del evento creation to succeed.");
  }

  return result.record;
}
