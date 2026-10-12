import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { submodalities } from "@/db/schema";
import {
  createModality,
  createSubmodality,
  deleteModality,
  deleteSubmodality,
  updateModality,
  updateSubmodality,
} from "@/lib/modalities/repository.server";
import { expectCreated } from "@/lib/events/bases.test-support";
import { createSavedEvent, eventDates } from "@/lib/test-support/events";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("`Bases del evento` repository", () => {
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
        "No se puede eliminar la modalidad porque tiene submodalidades relacionadas.",
    });

    await expect(deleteSubmodality(submodality.id)).resolves.toEqual({
      ok: true,
    });
    await expect(deleteModality(modality.id)).resolves.toEqual({ ok: true });
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

    const savedSubmodality = await db.query.submodalities.findFirst({
      where: eq(submodalities.id, submodality.id),
    });
    expect(savedSubmodality).toMatchObject({ name: "Hip Hop" });
  });
});
