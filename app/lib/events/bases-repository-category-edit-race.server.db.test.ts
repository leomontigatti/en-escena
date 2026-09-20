import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { categories } from "@/db/schema";
import {
  createCategory,
  updateCategory,
} from "@/lib/categories/repository.server";
import { createModality } from "@/lib/modalities/repository.server";
import {
  createChoreographyOnBases,
  createSavedAcademy,
  createSavedEvent,
  expectCreated,
} from "@/lib/events/bases-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

// What the race defeats is the pre-check: a registration that commits after it
// reads lands on a category whose age range the edit is about to invalidate.
// Losing the race for real needs a second connection committing between the two
// reads, which the default `pglite` backend cannot give (one in-process
// connection). Blinding the pre-check — and only it, by the executor it is
// handed — is the timing-free stand-in: the pool read answers as it would
// before the registration committed, the transaction's read answers as it would
// after. Everything else is real, the refusal included. The file is its own
// because the stub is module-wide.
vi.mock(
  "@/lib/events/bases-repository/shared.server",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/lib/events/bases-repository/shared.server")
      >();

    return {
      ...actual,
      listReferencingChoreographies: async (
        executor: Parameters<typeof actual.listReferencingChoreographies>[0],
        categoryId: string,
      ) =>
        executor === actual.db
          ? []
          : actual.listReferencingChoreographies(executor, categoryId),
    };
  },
);

installDatabaseTestHooks();

describe("editing a category under a racing registration", () => {
  test("refuses the edit with the same dependency failure a seen choreography gets, naming it", async () => {
    const event = await createSavedEvent("Regional 2026");
    const academy = await createSavedAcademy();
    const jazz = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const category = await expectCreated(
      createCategory(event.id, {
        name: "Infantil",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["solo"],
        modalityIds: [jazz.id],
        experienceLevels: [],
      }),
    );
    const choreography = await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      categoryId: category.id,
      name: "Luz",
      inscriptions: "none",
    });

    await expect(
      updateCategory(category.id, {
        name: "Infantil",
        minAge: 7,
        maxAge: 12,
        groupTypes: ["solo"],
        modalityIds: [jazz.id],
        experienceLevels: [],
      }),
    ).resolves.toEqual({
      ok: false,
      code: "event-bases-has-dependencies",
      error: `No se puede cambiar el rango de edad de una categoría que tiene una coreografía relacionada: n.º ${choreography.choreographyNumber} «Luz».`,
    });
    await expect(
      db.query.categories.findFirst({ where: eq(categories.id, category.id) }),
    ).resolves.toMatchObject({ minAge: 8 });
  });

  test("leaves an edit no choreography blocks alone: the re-read finds nothing and the write lands", async () => {
    const event = await createSavedEvent("Regional 2026");
    const jazz = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const category = await expectCreated(
      createCategory(event.id, {
        name: "Infantil",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["solo"],
        modalityIds: [jazz.id],
        experienceLevels: [],
      }),
    );

    await expect(
      updateCategory(category.id, {
        name: "Infantil",
        minAge: 7,
        maxAge: 12,
        groupTypes: ["solo"],
        modalityIds: [jazz.id],
        experienceLevels: [],
      }),
    ).resolves.toMatchObject({ ok: true, record: { minAge: 7 } });
  });
});
