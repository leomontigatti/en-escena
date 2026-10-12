import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { modalities } from "@/db/schema";
import { findModalityDeleteBlockers } from "@/lib/modalities/delete-blockers.server";
import {
  createModality,
  createSubmodality,
  deleteModality,
} from "@/lib/modalities/repository.server";
import { expectCreated } from "@/lib/events/bases.test-support";
import { createSavedEvent, eventDates } from "@/lib/test-support/events";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

// What the race defeats is the pre-check: a submodality created after it runs
// is invisible to it, and the delete goes on to meet the foreign key. Losing
// the race for real needs a second connection holding an uncommitted insert,
// which the default `pglite` backend cannot give, so the check is blinded for
// its first call only: the delete, the foreign key and the second look that
// names the blocker are all real. The file is its own because the stub is
// module-wide.
vi.mock("@/lib/modalities/delete-blockers.server", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/modalities/delete-blockers.server")
    >();

  return {
    ...actual,
    findModalityDeleteBlockers: vi
      .fn(actual.findModalityDeleteBlockers)
      .mockResolvedValueOnce([]),
  };
});

installDatabaseTestHooks();

describe("deleting a modality under a racing submodality", () => {
  test("refuses the delete with the same dependency failure a seen submodality gets", async () => {
    const event = await createSavedEvent({
      name: "Regional 2026",
      active: false,
      ...eventDates(2030),
    });
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    await expectCreated(
      createSubmodality(event.id, { modalityId: modality.id, name: "Lírico" }),
    );

    await expect(deleteModality(modality.id)).resolves.toEqual({
      ok: false,
      code: "event-bases-has-dependencies",
      error:
        "No se puede eliminar la modalidad porque tiene submodalidades relacionadas.",
    });
    // The blinded check and the second look after the foreign key refused: a
    // single call would mean the pre-check saw the submodality, not the race.
    expect(findModalityDeleteBlockers).toHaveBeenCalledTimes(2);
    await expect(
      db.query.modalities.findFirst({ where: eq(modalities.id, modality.id) }),
    ).resolves.toMatchObject({ id: modality.id });
  });
});
