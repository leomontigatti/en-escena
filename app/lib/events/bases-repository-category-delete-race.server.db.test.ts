import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { categories } from "@/db/schema";
import {
  createCategory,
  deleteCategory,
} from "@/lib/categories/repository.server";
import { createModality } from "@/lib/modalities/repository.server";
import {
  createChoreographyOnBases,
  createSavedAcademy,
  createSavedEvent,
  expectCreated,
} from "@/lib/events/bases-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

// What the race defeats is the pre-check: a choreography created after it runs
// is invisible to it, and the delete goes on to meet the foreign key. Losing
// the race for real needs a second connection holding an uncommitted insert,
// which the default `pglite` backend cannot give (one in-process connection, so
// the blocked delete would never be released). Blinding the check is the
// timing-free stand-in, and it is the only stub here: the delete, the foreign
// key and the failure it is mapped to are all real. The unstubbed pre-check
// path is covered by "reports deleting a category with choreographies as a
// dependency failure" in `bases-repository-catalog.server.db.test.ts`. The file
// is its own because the stub is module-wide.
vi.mock(
  "@/lib/events/bases-repository/shared.server",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/lib/events/bases-repository/shared.server")
      >();

    return { ...actual, hasReferencingChoreographies: async () => false };
  },
);

installDatabaseTestHooks();

describe("deleting a category under a racing choreography", () => {
  test("refuses the delete with the same dependency failure a seen choreography gets", async () => {
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
    await createChoreographyOnBases({
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
    await expect(
      db.query.categories.findFirst({ where: eq(categories.id, category.id) }),
    ).resolves.toMatchObject({ id: category.id });
  });
});
