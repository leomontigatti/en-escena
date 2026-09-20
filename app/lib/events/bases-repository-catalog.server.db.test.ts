import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographies, submodalities } from "@/db/schema";
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
  createChoreographyOnBases,
  createSavedAcademy,
  createSavedEvent,
  expectCreated,
  fixedExperienceLevel,
} from "@/lib/events/bases-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("`Bases del evento` repository", () => {
  test("keeps modality names unique inside one event only", async () => {
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

  test("manages submodalities under a modality and blocks deleting the parent while they exist", async () => {
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

  test("rejects a submodality assigned to a modality from another event", async () => {
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

  test("updates `Bases del evento` labels while preserving event-scoped uniqueness", async () => {
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

  test("keeps categories unique per event and modality set", async () => {
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
        experienceLevels: [],
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
        experienceLevels: [],
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      createCategory(firstEvent.id, {
        name: "Infantil Contemporáneo",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["duo", "solo"],
        modalityIds: [otherFirstModality.id],
        experienceLevels: [],
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      createCategory(firstEvent.id, {
        name: "Mini",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["duo", "solo"],
        modalityIds: [firstModality.id],
        experienceLevels: [firstLevel.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "Ya existe una categoría con ese rango de edad, tipos de grupo y modalidades.",
      fieldErrors: {},
    });
  });

  test("rejects category age overlaps and invalid experience levels", async () => {
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
        experienceLevels: [],
      }),
    );

    await expect(
      createCategory(firstEvent.id, {
        name: "Pre juvenil",
        minAge: 10,
        maxAge: 14,
        groupTypes: ["solo"],
        modalityIds: [firstModality.id],
        experienceLevels: [firstLevel.id],
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
        experienceLevels: ["level_other"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Elegí niveles de experiencia válidos.",
      fieldErrors: {
        experienceLevels: "Elegí niveles de experiencia válidos.",
      },
    });
  });

  test("updates categories and blocks deleting modalities with related categories", async () => {
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
        experienceLevels: [],
      }),
    );

    await expect(
      updateCategory(category.id, {
        name: " infantil a ",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["solo", "duo"],
        modalityIds: [modality.id],
        experienceLevels: [],
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

  test("refuses removing registration paths the choreographies of a category still occupy", async () => {
    const event = await createSavedEvent("Regional 2026");
    const academy = await createSavedAcademy();
    const jazz = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const urbanas = await expectCreated(
      createModality(event.id, { name: "Danzas urbanas" }),
    );
    const category = await expectCreated(
      createCategory(event.id, {
        name: "Infantil",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["solo", "duo"],
        modalityIds: [jazz.id, urbanas.id],
        experienceLevels: ["amateur", "profesional"],
      }),
    );
    await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      groupType: "solo",
      categoryId: category.id,
      experienceLevelId: "amateur",
    });

    const categoryInput = {
      name: "Infantil",
      minAge: 8,
      maxAge: 12,
      groupTypes: ["solo", "duo"],
      modalityIds: [jazz.id, urbanas.id],
      experienceLevels: ["amateur", "profesional"],
    };
    const occupiedPathError =
      "No se pueden quitar tipos de grupo ni modalidades que las coreografías de la categoría todavía usan.";

    await expect(
      updateCategory(category.id, { ...categoryInput, groupTypes: ["duo"] }),
    ).resolves.toMatchObject({ ok: false, error: occupiedPathError });
    await expect(
      updateCategory(category.id, {
        ...categoryInput,
        modalityIds: [urbanas.id],
      }),
    ).resolves.toMatchObject({ ok: false, error: occupiedPathError });
    await expect(
      updateCategory(category.id, {
        ...categoryInput,
        name: "Infantil A",
        groupTypes: ["solo"],
      }),
    ).resolves.toMatchObject({
      ok: true,
      record: { name: "Infantil A", groupTypes: ["solo"] },
    });
  });

  test("refuses moving the age range or the experience levels of a referenced category, naming the one choreography in the way", async () => {
    const { academy, category, event, jazz } = await createOccupiableCategory();
    const choreography = await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      categoryId: category.id,
      name: "Luz",
      inscriptions: "withdrawn",
    });
    const blocker = `n.º ${choreography.choreographyNumber} «Luz»`;

    const categoryInput = {
      name: "Infantil",
      minAge: 8,
      maxAge: 12,
      groupTypes: ["solo", "duo"],
      modalityIds: [jazz.id],
      experienceLevels: [],
    };

    await expect(
      updateCategory(category.id, { ...categoryInput, minAge: 7 }),
    ).resolves.toMatchObject({
      ok: false,
      code: "event-bases-has-dependencies",
      error: `No se puede cambiar el rango de edad de una categoría que tiene una coreografía relacionada: ${blocker}.`,
    });
    await expect(
      updateCategory(category.id, { ...categoryInput, maxAge: 13 }),
    ).resolves.toMatchObject({
      ok: false,
      code: "event-bases-has-dependencies",
      error: `No se puede cambiar el rango de edad de una categoría que tiene una coreografía relacionada: ${blocker}.`,
    });
    await expect(
      updateCategory(category.id, {
        ...categoryInput,
        experienceLevels: ["amateur", "profesional"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "event-bases-has-dependencies",
      error: `No se pueden cambiar los niveles de experiencia de una categoría que tiene una coreografía relacionada: ${blocker}.`,
    });
    await expect(
      updateCategory(category.id, { ...categoryInput, name: "Infantil A" }),
    ).resolves.toMatchObject({ ok: true, record: { name: "Infantil A" } });
  });

  test("names at most five blocking choreographies and counts the rest", async () => {
    const { academy, category, event, jazz } = await createOccupiableCategory();
    const blockers = [];

    for (const name of ["Luz", "Sombra", "Agua", "Fuego", "Aire", "Tierra"]) {
      const choreography = await createChoreographyOnBases({
        eventId: event.id,
        academyId: academy.id,
        modalityId: jazz.id,
        categoryId: category.id,
        name,
        inscriptions: "withdrawn",
      });

      blockers.push(`n.º ${choreography.choreographyNumber} «${name}»`);
    }

    const [first, second, third, fourth, fifth] = blockers;

    await expect(
      updateCategory(category.id, {
        name: "Infantil",
        minAge: 7,
        maxAge: 12,
        groupTypes: ["solo", "duo"],
        modalityIds: [jazz.id],
        experienceLevels: [],
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "event-bases-has-dependencies",
      error: `No se puede cambiar el rango de edad de una categoría que tiene coreografías relacionadas: ${first}, ${second}, ${third}, ${fourth}, ${fifth} y 1 más.`,
    });
  });

  test("allows moving the age range and the experience levels of a category no choreography references", async () => {
    const { category, jazz } = await createOccupiableCategory();

    await expect(
      updateCategory(category.id, {
        name: "Infantil",
        minAge: 7,
        maxAge: 13,
        groupTypes: ["solo", "duo"],
        modalityIds: [jazz.id],
        experienceLevels: ["amateur", "profesional"],
      }),
    ).resolves.toMatchObject({
      ok: true,
      record: {
        minAge: 7,
        maxAge: 13,
        experienceLevels: ["amateur", "profesional"],
      },
    });
  });

  test("keeps the registration paths of a category whose choreography only has withdrawn inscriptions", async () => {
    const { academy, category, event, jazz } = await createOccupiableCategory();
    await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      categoryId: category.id,
      groupType: "solo",
      inscriptions: "withdrawn",
    });

    await expect(
      updateCategory(category.id, {
        name: "Infantil",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["duo"],
        modalityIds: [jazz.id],
        experienceLevels: [],
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "event-bases-has-dependencies",
      error:
        "No se pueden quitar tipos de grupo ni modalidades que las coreografías de la categoría todavía usan.",
    });
    await expect(
      updateCategory(category.id, {
        name: "Infantil A",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["solo", "duo"],
        modalityIds: [jazz.id],
        experienceLevels: [],
      }),
    ).resolves.toMatchObject({ ok: true, record: { name: "Infantil A" } });
  });

  test("keeps the registration paths of a category whose choreography carries no inscription", async () => {
    const { academy, category, event, jazz } = await createOccupiableCategory();
    await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      categoryId: category.id,
      inscriptions: "none",
    });

    await expect(
      updateCategory(category.id, {
        name: "Infantil",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["duo"],
        modalityIds: [jazz.id],
        experienceLevels: [],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se pueden quitar tipos de grupo ni modalidades que las coreografías de la categoría todavía usan.",
    });
  });

  test("reports deleting a category with choreographies as a dependency failure", async () => {
    const { academy, category, event, jazz } = await createOccupiableCategory({
      groupTypes: ["solo"],
    });
    const choreography = await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      categoryId: category.id,
      inscriptions: "none",
    });

    await expect(deleteCategory(category.id)).resolves.toEqual({
      ok: false,
      code: "event-bases-has-dependencies",
      error:
        "No se puede borrar la categoría porque tiene coreografías relacionadas.",
    });

    await db
      .delete(choreographies)
      .where(eq(choreographies.id, choreography.id));

    await expect(deleteCategory(category.id)).resolves.toEqual({ ok: true });
  });
});

/**
 * An event with one modality and one category ready to be occupied: every guard
 * test here needs the same four rows before it can say anything interesting.
 */
async function createOccupiableCategory({
  groupTypes = ["solo", "duo"],
}: { groupTypes?: string[] } = {}) {
  const event = await createSavedEvent("Regional 2026");
  const academy = await createSavedAcademy();
  const jazz = await expectCreated(createModality(event.id, { name: "Jazz" }));
  const category = await expectCreated(
    createCategory(event.id, {
      name: "Infantil",
      minAge: 8,
      maxAge: 12,
      groupTypes,
      modalityIds: [jazz.id],
      experienceLevels: [],
    }),
  );

  return { academy, category, event, jazz };
}
