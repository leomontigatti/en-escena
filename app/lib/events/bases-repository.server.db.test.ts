import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { scheduleEntries, submodalities } from "@/db/schema";
import {
  createCategory,
  createExperienceLevel,
  createModality,
  createPrice,
  createScheduleEntry,
  createScheduleBlock,
  createSubmodality,
  deleteCategory,
  deleteExperienceLevel,
  deleteModality,
  deletePrice,
  deleteScheduleEntry,
  deleteScheduleBlock,
  deleteSubmodality,
  listEventBasesData,
  resolveApplicablePrice,
  resolveCompatibleScheduleEntries,
  updateCategory,
  updateExperienceLevel,
  updateModality,
  updatePrice,
  updateScheduleEntry,
  updateScheduleBlock,
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
        name: "Infantil",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["solo", "duo"],
        modalityIds: [firstModality.id],
        experienceLevelIds: [],
      }),
    );
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
        name: " Infantil ",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["duo", "solo"],
        modalityIds: [firstModality.id],
        experienceLevelIds: [],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Ya existe una categoría equivalente en este evento.",
      fieldErrors: { name: "Revisá la combinación de la categoría." },
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
      fieldErrors: { ageRange: "Ajustá las edades o la aplicabilidad." },
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
        name: "Infantil A",
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

  test("manages bloques horarios with event-scoped modalidades, cupo validation and dependency guardrails", async () => {
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
      createScheduleBlock(firstEvent.id, {
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
      createScheduleBlock(firstEvent.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [],
      }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: {
        modalityIds: "Elegí al menos una modalidad aceptada.",
      },
    });
    await expect(
      createScheduleBlock(firstEvent.id, {
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
      createScheduleBlock(firstEvent.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [jazz.id, urbanas.id],
      }),
    );
    await expectCreated(
      createScheduleBlock(secondEvent.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-06-02",
        startTime: "11:00",
        totalCapacity: 10,
        modalityIds: [otherEventModality.id],
      }),
    );

    await expect(listEventBasesData(firstEvent.id)).resolves.toMatchObject({
      scheduleBlocks: [
        {
          eventId: firstEvent.id,
          name: "Sábado mañana",
          modalityIds: expect.arrayContaining([jazz.id, urbanas.id]),
        },
      ],
    });

    await expect(
      updateScheduleBlock(
        block.id,
        {
          name: "Sábado temprano",
          scheduledDate: "2026-05-02",
          startTime: "09:00",
          totalCapacity: 20,
          modalityIds: [jazz.id, urbanas.id],
        },
        { hasDependencies: async () => true },
      ),
    ).resolves.toMatchObject({
      ok: true,
      record: { name: "Sábado temprano" },
    });
    await expect(
      updateScheduleBlock(
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
        "No se pueden editar fecha, hora, cupo total ni modalidades aceptadas porque el bloque horario tiene dependencias.",
    });
    await expect(
      deleteScheduleBlock(block.id, { hasDependencies: async () => true }),
    ).resolves.toMatchObject({
      ok: false,
      error: "No se puede borrar el bloque horario porque tiene dependencias.",
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
      createScheduleBlock(firstEvent.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [jazz.id],
      }),
    );
    const otherEventBlock = await expectCreated(
      createScheduleBlock(secondEvent.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-06-02",
        startTime: "11:00",
        totalCapacity: 10,
        modalityIds: [otherEventModality.id],
      }),
    );

    const general = await expectCreated(
      createPrice(firstEvent.id, {
        name: "Solo general",
        groupType: "solo",
        amount: 12000,
        scheduleBlockId: null,
      }),
    );
    const specific = await expectCreated(
      createPrice(firstEvent.id, {
        name: "Solo sábado",
        groupType: "solo",
        amount: 15000,
        scheduleBlockId: block.id,
      }),
    );
    await expect(deleteScheduleBlock(block.id)).resolves.toMatchObject({
      ok: false,
      error: "No se puede borrar el bloque horario porque tiene dependencias.",
    });
    await expect(
      createPrice(secondEvent.id, {
        name: "Solo general",
        groupType: "solo",
        amount: 9000,
        scheduleBlockId: null,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      createPrice(firstEvent.id, {
        name: "Solo duplicado",
        groupType: "solo",
        amount: 13000,
        scheduleBlockId: null,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Ya existe un precio general para ese tipo de grupo.",
      fieldErrors: { groupType: "Revisá el tipo de grupo del precio." },
    });
    await expect(
      createPrice(firstEvent.id, {
        name: "Solo otro evento",
        groupType: "solo",
        amount: 13000,
        scheduleBlockId: otherEventBlock.id,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Elegí un bloque horario del evento activo.",
      fieldErrors: {
        scheduleBlockId: "Elegí un bloque horario del evento activo.",
      },
    });

    await expect(
      resolveApplicablePrice({
        eventId: firstEvent.id,
        groupType: "solo",
        scheduleBlockId: block.id,
      }),
    ).resolves.toMatchObject({
      ok: true,
      price: { id: specific.id, amount: 15000 },
    });
    await expect(
      resolveApplicablePrice({
        eventId: firstEvent.id,
        groupType: "solo",
        scheduleBlockId: null,
      }),
    ).resolves.toMatchObject({
      ok: true,
      price: { id: general.id, amount: 12000 },
    });
    await expect(
      resolveApplicablePrice({
        eventId: firstEvent.id,
        groupType: "duo",
        scheduleBlockId: block.id,
      }),
    ).resolves.toEqual({
      ok: false,
      code: "missing-price",
      error:
        "No hay un precio configurado para este tipo de grupo y bloque horario.",
    });

    await expect(listEventBasesData(firstEvent.id)).resolves.toMatchObject({
      prices: [
        {
          eventId: firstEvent.id,
          name: "Solo sábado",
          scheduleBlock: { name: "Sábado mañana" },
        },
        {
          eventId: firstEvent.id,
          name: "Solo general",
          scheduleBlock: null,
        },
      ],
    });

    await expect(
      updatePrice(
        general.id,
        {
          name: "Solo general actualizado",
          groupType: "solo",
          amount: 12000,
          scheduleBlockId: null,
        },
        { hasDependencies: async () => true },
      ),
    ).resolves.toMatchObject({
      ok: true,
      record: { name: "Solo general actualizado" },
    });
    await expect(
      updatePrice(
        general.id,
        {
          name: "Solo general actualizado",
          groupType: "solo",
          amount: 14000,
          scheduleBlockId: null,
        },
        { hasDependencies: async () => true },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se pueden editar monto, tipo de grupo ni bloque horario porque el precio tiene dependencias.",
    });
    await expect(
      deletePrice(general.id, { hasDependencies: async () => true }),
    ).resolves.toMatchObject({
      ok: false,
      error: "No se puede borrar el precio porque tiene dependencias.",
    });
  });

  test("manages cronogramas with unique group types, block cupo limits and compatibility resolution", async () => {
    const event = await createSavedEvent("Regional 2026");
    const jazz = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const urbanas = await expectCreated(
      createModality(event.id, { name: "Danzas urbanas" }),
    );
    const block = await expectCreated(
      createScheduleBlock(event.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 10,
        modalityIds: [jazz.id],
      }),
    );
    const otherBlock = await expectCreated(
      createScheduleBlock(event.id, {
        name: "Sábado tarde",
        scheduledDate: "2026-05-02",
        startTime: "14:00",
        totalCapacity: 8,
        modalityIds: [jazz.id],
      }),
    );

    const soloSchedule = await expectCreated(
      createScheduleEntry(block.id, {
        groupTypes: ["solo"],
        capacity: 6,
      }),
    );
    await expect(
      createScheduleEntry(block.id, {
        groupTypes: ["solo"],
        capacity: 2,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "Ya existe un cronograma para esa combinación de tipos de grupo en este bloque horario.",
      fieldErrors: { groupTypes: "Revisá los tipos de grupo del cronograma." },
    });
    await expect(
      createScheduleEntry(block.id, {
        groupTypes: ["duo"],
        capacity: 5,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "La suma de cupos de cronogramas no puede superar el cupo total del bloque horario.",
      fieldErrors: { capacity: "Ajustá el cupo del cronograma." },
    });
    await expectCreated(
      createScheduleEntry(otherBlock.id, {
        groupTypes: ["solo"],
        capacity: 3,
      }),
    );

    await expect(
      resolveCompatibleScheduleEntries({
        eventId: event.id,
        modalityId: urbanas.id,
        groupType: "solo",
      }),
    ).resolves.toMatchObject({
      status: "none",
      error:
        "No hay cronogramas compatibles para la modalidad y el tipo de grupo seleccionados.",
    });
    await expect(
      resolveCompatibleScheduleEntries({
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
      updateScheduleEntry(
        soloSchedule.id,
        { groupTypes: ["solo", "duo"], capacity: 6 },
        { hasDependencies: async () => true },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se pueden editar tipos de grupo ni cupo porque el cronograma tiene dependencias.",
    });
    await expect(
      deleteScheduleEntry(soloSchedule.id, {
        hasDependencies: async () => true,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "No se puede borrar el cronograma porque tiene dependencias.",
    });

    const savedSchedule = await db.query.scheduleEntries.findFirst({
      where: eq(scheduleEntries.id, soloSchedule.id),
    });
    expect(savedSchedule).toMatchObject({ capacity: 6, groupTypeKey: "solo" });
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
