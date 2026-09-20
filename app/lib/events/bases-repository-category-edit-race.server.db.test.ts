import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { categories } from "@/db/schema";
import {
  createCategory,
  updateCategory,
} from "@/lib/categories/repository.server";
import { createModality } from "@/lib/modalities/repository.server";
import type { CategoryInput } from "@/lib/events/bases-repository/shared.server";
import {
  createChoreographyOnBases,
  createSavedAcademy,
  createSavedEvent,
  expectCreated,
} from "@/lib/events/bases-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

// Which connection each read of the guard ran on, in order. The stub below
// blinds one of them, so a test that does not also pin this would still pass if
// the blinding silently stopped applying — the unblinded pre-check refuses with
// the very message these tests assert. Pinning it is what keeps that failure
// loud.
const guardReads = vi.hoisted(() => [] as ("pool" | "transaction")[]);

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
      ) => {
        const onPool = executor === actual.db;

        guardReads.push(onPool ? "pool" : "transaction");

        return onPool
          ? []
          : actual.listReferencingChoreographies(executor, categoryId);
      },
    };
  },
);

installDatabaseTestHooks();

beforeEach(() => {
  guardReads.length = 0;
});

async function arrangeCategory() {
  const event = await createSavedEvent("Regional 2026");
  const jazz = await expectCreated(createModality(event.id, { name: "Jazz" }));
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

  return { category, event, jazz };
}

function widenTheAgeRange(jazzId: string): CategoryInput {
  return {
    name: "Infantil",
    minAge: 7,
    maxAge: 12,
    groupTypes: ["solo"],
    modalityIds: [jazzId],
    experienceLevels: [],
  };
}

describe("editing a category under a racing registration", () => {
  test("refuses the edit with the same dependency failure a seen choreography gets, naming it", async () => {
    const { category, event, jazz } = await arrangeCategory();
    const academy = await createSavedAcademy();
    const choreography = await createChoreographyOnBases({
      eventId: event.id,
      academyId: academy.id,
      modalityId: jazz.id,
      categoryId: category.id,
      name: "Luz",
      inscriptions: "none",
    });

    await expect(
      updateCategory(category.id, widenTheAgeRange(jazz.id)),
    ).resolves.toEqual({
      ok: false,
      code: "event-bases-has-dependencies",
      error: `No se puede cambiar el rango de edad de una categoría que tiene una coreografía relacionada: n.º ${choreography.choreographyNumber} «Luz».`,
    });
    // The pre-check read the pool and was blinded; the refusal above is the
    // transaction's own read, which is the whole point of the change.
    expect(guardReads).toEqual(["pool", "transaction"]);
    await expect(
      db.query.categories.findFirst({ where: eq(categories.id, category.id) }),
    ).resolves.toMatchObject({ minAge: 8 });
  });

  test("saves an edit no choreography blocks", async () => {
    const { category, jazz } = await arrangeCategory();

    await expect(
      updateCategory(category.id, widenTheAgeRange(jazz.id)),
    ).resolves.toMatchObject({ ok: true, record: { minAge: 7 } });
    expect(guardReads).toEqual(["pool", "transaction"]);
  });

  test("asks the database nothing when the edit moves neither the age range nor the levels", async () => {
    const { category, jazz } = await arrangeCategory();

    await expect(
      updateCategory(category.id, {
        name: "Infantil A",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["solo"],
        modalityIds: [jazz.id],
        experienceLevels: [],
      }),
    ).resolves.toMatchObject({ ok: true, record: { name: "Infantil A" } });
    expect(guardReads).toEqual([]);
  });
});
