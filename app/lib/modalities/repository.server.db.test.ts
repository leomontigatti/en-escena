import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { scheduleModalities, schedules } from "@/db/schema";
import { createCategory } from "@/lib/categories/repository.server";
import { findModalityDeleteBlockers } from "@/lib/modalities/delete-blockers.server";
import {
  createModality,
  createModalityWithSubmodalities,
  createSubmodality,
  deleteModality,
  deleteSubmodality,
  listModalities,
  listSubmodalities,
  updateModality,
  updateSubmodality,
} from "@/lib/modalities/repository.server";
import { expectCreated } from "@/lib/events/bases.test-support";
import { createSavedEvent, eventDates } from "@/lib/test-support/events";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("`Bases del evento` modalities repository", () => {
  test("creates a modality together with its submodalities in one transaction", async () => {
    const event = await createSavedEvent({
      name: "Regional 2026",
      active: false,
      ...eventDates(2030),
    });

    const modality = await expectCreated(
      createModalityWithSubmodalities(event.id, {
        name: " jazz ",
        submodalities: [{ name: " lírico " }, { name: "Contemporáneo" }],
      }),
    );

    if (!("name" in modality)) {
      throw new Error("Expected the created `Modalidad` to include a name.");
    }
    expect(modality.name).toBe("Jazz");

    const submodalities = await listSubmodalities(event.id);
    expect(submodalities).toHaveLength(2);
    expect(
      submodalities.every((entry) => entry.modalityId === modality.id),
    ).toBe(true);
    expect(submodalities.every((entry) => entry.eventId === event.id)).toBe(
      true,
    );
    expect(submodalities.map((entry) => entry.name).sort()).toEqual([
      "Contemporáneo",
      "Lírico",
    ]);
  });

  test("creates a modality with zero submodalities", async () => {
    const event = await createSavedEvent({
      name: "Regional 2026",
      active: false,
      ...eventDates(2030),
    });

    const modality = await expectCreated(
      createModalityWithSubmodalities(event.id, {
        name: "Urbanas",
        submodalities: [],
      }),
    );

    await expect(listModalities(event.id)).resolves.toMatchObject([
      { id: modality.id, name: "Urbanas" },
    ]);
    await expect(listSubmodalities(event.id)).resolves.toEqual([]);
  });

  test("surfaces the unique submodality name conflict and rolls back the whole insert", async () => {
    const event = await createSavedEvent({
      name: "Regional 2026",
      active: false,
      ...eventDates(2030),
    });

    await expect(
      createModalityWithSubmodalities(event.id, {
        name: "Jazz",
        submodalities: [{ name: "Lírico" }, { name: " lírico " }],
      }),
    ).resolves.toMatchObject({ ok: false, code: "duplicate-name" });

    await expect(listModalities(event.id)).resolves.toEqual([]);
    await expect(listSubmodalities(event.id)).resolves.toEqual([]);
  });

  test("rejects an existing modality name without persisting submodalities", async () => {
    const event = await createSavedEvent({
      name: "Regional 2026",
      active: false,
      ...eventDates(2030),
    });
    const existing = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );

    await expect(
      createModalityWithSubmodalities(event.id, {
        name: "jazz",
        submodalities: [{ name: "Lírico" }],
      }),
    ).resolves.toMatchObject({ ok: false, code: "duplicate-name" });

    await expect(listModalities(event.id)).resolves.toMatchObject([
      { id: existing.id, name: "Jazz" },
    ]);
    await expect(listSubmodalities(event.id)).resolves.toEqual([]);
  });

  test("keeps modality names unique inside one event only", async () => {
    const firstEvent = await createSavedEvent({
      name: "Regional 2026",
      active: false,
      ...eventDates(2030),
    });
    const secondEvent = await createSavedEvent({
      name: "Final 2026",
      active: false,
      ...eventDates(2030),
    });

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

  test("manages submodalities under a modality and blocks deleting the parent while they exist", async () => {
    const event = await createSavedEvent({
      name: "Regional 2026",
      active: false,
      ...eventDates(2030),
    });
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
    const savedCreatedSubmodality = (await listSubmodalities(event.id)).find(
      (saved) => saved.id === submodality.id,
    );
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
        "No se puede eliminar la modalidad porque tiene submodalidades relacionadas.",
    });

    await expect(deleteSubmodality(submodality.id)).resolves.toEqual({
      ok: true,
    });
    await expect(deleteModality(modality.id)).resolves.toEqual({ ok: true });
  });

  test("names every relation that blocks deleting a modality", async () => {
    const event = await createSavedEvent({
      name: "Regional 2026",
      active: false,
      ...eventDates(2030),
    });
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );

    await expect(findModalityDeleteBlockers(modality.id)).resolves.toEqual([]);

    await expectCreated(
      createSubmodality(event.id, { modalityId: modality.id, name: "Lírico" }),
    );
    await expectCreated(
      createCategory(event.id, {
        name: "Infantil",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["solo"],
        modalityIds: [modality.id],
        experienceLevels: [],
      }),
    );
    const [schedule] = await db
      .insert(schedules)
      .values({
        eventId: event.id,
        name: "Función 1",
        scheduledDate: "2030-05-01",
        startTime: "16:00",
        totalCapacity: 10,
      })
      .returning();
    await db
      .insert(scheduleModalities)
      .values({ scheduleId: schedule.id, modalityId: modality.id });

    await expect(findModalityDeleteBlockers(modality.id)).resolves.toEqual([
      "submodalities",
      "categories",
      "schedules",
    ]);
    await expect(deleteModality(modality.id)).resolves.toMatchObject({
      ok: false,
      error:
        "No se puede eliminar la modalidad porque tiene submodalidades relacionadas.",
    });
  });

  test("rejects a submodality assigned to a modality from another event", async () => {
    const firstEvent = await createSavedEvent({
      name: "Regional 2026",
      active: false,
      ...eventDates(2030),
    });
    const secondEvent = await createSavedEvent({
      name: "Final 2026",
      active: false,
      ...eventDates(2030),
    });
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

  test("updates `Bases del evento` labels while preserving event-scoped uniqueness", async () => {
    const event = await createSavedEvent({
      name: "Regional 2026",
      active: false,
      ...eventDates(2030),
    });
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

    const savedSubmodality = (await listSubmodalities(event.id)).find(
      (saved) => saved.id === submodality.id,
    );
    expect(savedSubmodality).toMatchObject({ name: "Hip Hop" });
  });

  test("reports a duplicate modality and a duplicate submodality as a name collision", async () => {
    const event = await createSavedEvent({
      name: "Regional 2026",
      active: false,
      ...eventDates(2030),
    });
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const otherModality = await expectCreated(
      createModality(event.id, { name: "Urbanas" }),
    );
    await expectCreated(
      createSubmodality(event.id, { modalityId: modality.id, name: "Lírico" }),
    );
    const otherSubmodality = await expectCreated(
      createSubmodality(event.id, { modalityId: modality.id, name: "Funk" }),
    );
    const duplicateModality = {
      ok: false,
      code: "duplicate-name",
      error: "Ya existe una modalidad con ese nombre en este evento.",
      fieldErrors: { name: "Usá un nombre distinto para la modalidad." },
    };
    const duplicateSubmodality = {
      ok: false,
      code: "duplicate-name",
      error: "Ya existe una submodalidad con ese nombre en esta modalidad.",
      fieldErrors: { name: "Usá un nombre distinto para la submodalidad." },
    };

    await expect(createModality(event.id, { name: " jazz " })).resolves.toEqual(
      duplicateModality,
    );
    await expect(
      updateModality(otherModality.id, { name: "JAZZ" }),
    ).resolves.toEqual(duplicateModality);
    await expect(
      createSubmodality(event.id, { modalityId: modality.id, name: "lirico" }),
    ).resolves.toEqual(duplicateSubmodality);
    await expect(
      updateSubmodality(otherSubmodality.id, {
        modalityId: modality.id,
        name: "Lírico",
      }),
    ).resolves.toEqual(duplicateSubmodality);
  });
});
