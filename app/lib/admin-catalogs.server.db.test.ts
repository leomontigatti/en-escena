import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { submodalities } from "@/db/schema";
import {
  createCategory,
  createExperienceLevel,
  createModality,
  createPrice,
  createScheduleBlock,
  createSubmodality,
  deleteCategory,
  deleteExperienceLevel,
  deleteModality,
  deletePrice,
  deleteScheduleBlock,
  deleteSubmodality,
  listEventCatalogs,
  resolveApplicablePrice,
  updateCategory,
  updateExperienceLevel,
  updateModality,
  updatePrice,
  updateScheduleBlock,
  updateSubmodality,
} from "@/lib/admin-catalogs.server";
import { createEvent } from "@/lib/event-management.server";

import { installDatabaseTestHooks } from "../../tests/db/harness";

installDatabaseTestHooks();

describe("admin event catalogs", () => {
  test("keeps Modalidad names unique inside one Evento only", async () => {
    const firstEvent = await createSavedEvent("Regional 2026");
    const secondEvent = await createSavedEvent("Final 2026");

    await expect(
      createModality(firstEvent.id, { name: "Jazz" }),
    ).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      createModality(secondEvent.id, { name: "Jazz" }),
    ).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      createModality(firstEvent.id, { name: " Jazz " }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Ya existe una Modalidad con ese nombre en este Evento.",
      fieldErrors: { name: "Usá un nombre distinto para la Modalidad." },
    });
  });

  test("manages Submodalidades under a Modalidad and blocks deleting the parent while they exist", async () => {
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
        name: "Hip hop",
      }),
    );
    await expect(
      createSubmodality(event.id, {
        modalityId: otherModality.id,
        name: "Hip hop",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Ya existe una Submodalidad con ese nombre en este Evento.",
      fieldErrors: { name: "Usá un nombre distinto para la Submodalidad." },
    });
    await expect(deleteModality(modality.id)).resolves.toMatchObject({
      ok: false,
      error:
        "No se puede borrar la Modalidad porque tiene Submodalidades relacionadas.",
    });

    await expect(deleteSubmodality(submodality.id)).resolves.toEqual({
      ok: true,
    });
    await expect(deleteModality(modality.id)).resolves.toEqual({ ok: true });
  });

  test("rejects a Submodalidad assigned to a Modalidad from another Evento", async () => {
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
      error: "Elegí una Modalidad del Evento de trabajo.",
      fieldErrors: { modalityId: "Elegí una Modalidad del Evento de trabajo." },
    });
  });

  test("keeps Nivel de experiencia names unique inside one Evento only", async () => {
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
      error: "Ya existe un Nivel de experiencia con ese nombre en este Evento.",
      fieldErrors: {
        name: "Usá un nombre distinto para el Nivel de experiencia.",
      },
    });
    await expect(
      updateExperienceLevel(level.id, { name: "Principiante" }),
    ).resolves.toMatchObject({ ok: true, record: { name: "Principiante" } });
  });

  test("updates catalog labels while preserving event-scoped uniqueness", async () => {
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
      fieldErrors: { name: "Usá un nombre distinto para la Submodalidad." },
    });

    const savedSubmodality = await db.query.submodalities.findFirst({
      where: eq(submodalities.id, submodality.id),
    });
    expect(savedSubmodality).toMatchObject({ name: "Hip hop" });
  });

  test("manages Categorías with event-scoped uniqueness, optional levels and overlap validation", async () => {
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
      error: "Ya existe una Categoría equivalente en este Evento.",
      fieldErrors: { name: "Revisá la combinación de la Categoría." },
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
        "La Categoría se solapa con otra Categoría para la misma Modalidad y Tipo de grupo.",
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
      error: "Elegí Niveles de experiencia del Evento de trabajo.",
      fieldErrors: {
        experienceLevelIds:
          "Elegí Niveles de experiencia del Evento de trabajo.",
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
        "No se puede borrar la Modalidad porque tiene Categorías relacionadas.",
    });
    await expect(deleteCategory(category.id)).resolves.toEqual({ ok: true });
    await expect(deleteModality(firstModality.id)).resolves.toEqual({
      ok: true,
    });
  });

  test("manages Bloques horarios with Evento-scoped Modalidades, cupo validation and dependency guardrails", async () => {
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
        modalityIds: "Elegí al menos una Modalidad aceptada.",
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
        modalityIds: "Elegí Modalidades del Evento de trabajo.",
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

    await expect(listEventCatalogs(firstEvent.id)).resolves.toMatchObject({
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
        "No se pueden editar fecha, hora, cupo total ni Modalidades aceptadas porque el Bloque horario tiene dependencias.",
    });
    await expect(
      deleteScheduleBlock(block.id, { hasDependencies: async () => true }),
    ).resolves.toMatchObject({
      ok: false,
      error: "No se puede borrar el Bloque horario porque tiene dependencias.",
    });
  });

  test("manages Precios with event-scoped uniqueness, resolution precedence and dependency guardrails", async () => {
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
      error: "No se puede borrar el Bloque horario porque tiene dependencias.",
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
      error: "Ya existe un Precio general para ese Tipo de grupo.",
      fieldErrors: { groupType: "Revisá el Tipo de grupo del Precio." },
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
      error: "Elegí un Bloque horario del Evento de trabajo.",
      fieldErrors: {
        scheduleBlockId: "Elegí un Bloque horario del Evento de trabajo.",
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
        "No hay un Precio configurado para este Tipo de grupo y Bloque horario.",
    });

    await expect(listEventCatalogs(firstEvent.id)).resolves.toMatchObject({
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
        "No se pueden editar monto, Tipo de grupo ni Bloque horario porque el Precio tiene dependencias.",
    });
    await expect(
      deletePrice(general.id, { hasDependencies: async () => true }),
    ).resolves.toMatchObject({
      ok: false,
      error: "No se puede borrar el Precio porque tiene dependencias.",
    });
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
    record?: { id: string; name: string };
  }>,
) {
  const result = await resultPromise;

  if (!result.ok || !result.record) {
    throw new Error("Expected catalog creation to succeed.");
  }

  return result.record;
}
