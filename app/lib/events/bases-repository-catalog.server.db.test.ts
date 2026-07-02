import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { submodalities } from "@/db/schema";
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "@/lib/categories/repository.server";
import {
  createModality,
  createSubmodality,
  deleteModality,
  deleteSubmodality,
  updateModality,
  updateSubmodality,
} from "@/lib/modalities/repository.server";
import {
  createSavedEvent,
  expectCreated,
  fixedExperienceLevel,
} from "@/lib/events/bases-test-fixtures.server.db";

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

  test("keeps categorías unique per evento and modalidad set", async () => {
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
    const firstLevel = fixedExperienceLevel(firstEvent.id);

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
    if (!("name" in category)) {
      throw new Error("Expected created category to include a name.");
    }
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
  });

  test("rejects categoría age overlaps and invalid experience levels", async () => {
    const firstEvent = await createSavedEvent("Regional 2026");
    const firstModality = await expectCreated(
      createModality(firstEvent.id, { name: "Jazz" }),
    );
    const firstLevel = fixedExperienceLevel(firstEvent.id);

    await expectCreated(
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
        experienceLevelIds: ["level_other"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Elegí niveles de experiencia válidos.",
      fieldErrors: {
        experienceLevelIds: "Elegí niveles de experiencia válidos.",
      },
    });
  });

  test("updates categorías and blocks deleting modalidades with related categorías", async () => {
    const event = await createSavedEvent("Regional 2026");
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const category = await expectCreated(
      createCategory(event.id, {
        name: "Infantil",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["solo", "duo"],
        modalityIds: [modality.id],
        experienceLevelIds: [],
      }),
    );

    await expect(
      updateCategory(category.id, {
        name: " infantil a ",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["solo", "duo"],
        modalityIds: [modality.id],
        experienceLevelIds: [],
      }),
    ).resolves.toMatchObject({
      ok: true,
      record: { name: "Infantil A" },
    });
    await expect(deleteModality(modality.id)).resolves.toMatchObject({
      ok: false,
      error:
        "No se puede borrar la modalidad porque tiene categorías relacionadas.",
    });
    await expect(deleteCategory(category.id)).resolves.toEqual({ ok: true });
    await expect(deleteModality(modality.id)).resolves.toEqual({
      ok: true,
    });
  });
});
