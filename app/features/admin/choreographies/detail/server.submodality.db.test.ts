import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { choreographies, submodalities } from "@/db/schema";
import {
  createAcademySession,
  createChoreographyRecord,
  createEventCatalog,
  createEventRecord,
  date,
} from "@/features/portal/choreographies/test-support/db";
import { evaluatedChoreographyMessage } from "@/lib/choreographies/choreography-locks";
import { evaluatedChoreographyIds } from "@/lib/presentations/evaluation-lock.test-support";
import { expectThrownResponse } from "@/lib/test-support/http";
import {
  saveDraftEdits,
  submitDraftAsAuditor,
} from "@/features/admin/choreographies/detail/server.test-support";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

// The evaluated lock is the seam the judging effort will fill; until then it
// answers `false` for everything, so a test that needs a closed choreography
// declares it here.
vi.mock(
  "@/lib/presentations/evaluation-lock.server",
  async () =>
    (await import("@/lib/presentations/evaluation-lock.test-support"))
      .evaluationLockStub,
);

beforeEach(() => {
  evaluatedChoreographyIds.clear();
});

installDatabaseTestHooks();

describe("administrative choreography detail: submodality", () => {
  test("updates the submodality within the same modality for admins and bumps updatedAt", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Submodalidad",
      email: "admin.coreografias.submodalidad.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const otherSubmodality = await createSubmodalityRecord({
      eventId: event.id,
      modalityId: catalog.modality.id,
      name: "Contemporáneo",
    });
    const staleUpdatedAt = date("2026-01-01T12:00:00Z");
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Con submodalidad",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
      updatedAt: staleUpdatedAt,
    });

    const response = await saveDraftEdits({
      choreographyId: choreography.id,
      edits: { submodalityId: otherSubmodality.id },
    });

    expect(response).not.toBeInstanceOf(Response);
    expect(response).toMatchObject({
      message: "Coreografía guardada.",
      status: "success",
    });

    const stored = await db.query.choreographies.findFirst({
      columns: { submodalityId: true, updatedAt: true },
      where: eq(choreographies.id, choreography.id),
    });
    expect(stored?.submodalityId).toBe(otherSubmodality.id);
    expect(stored?.updatedAt.getTime()).toBeGreaterThan(
      staleUpdatedAt.getTime(),
    );
  });

  test("refuses a new submodality once the choreography was evaluated", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Submodalidad Presentada",
      email: "admin.coreografias.submodalidad.presentada.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const otherSubmodality = await createSubmodalityRecord({
      eventId: event.id,
      modalityId: catalog.modality.id,
      name: "Contemporáneo",
    });
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Evaluada",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    evaluatedChoreographyIds.add(choreography.id);

    const result = await saveDraftEdits({
      choreographyId: choreography.id,
      edits: { submodalityId: otherSubmodality.id },
    });

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toEqual({
      message: evaluatedChoreographyMessage,
      status: "error",
    });
    await expect(
      db.query.choreographies.findFirst({
        columns: { submodalityId: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toEqual({ submodalityId: catalog.submodality.id });
  });

  test("blocks auditors from updating the submodality", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Submodalidad Auditor",
      email: "admin.coreografias.submodalidad.auditor.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const otherSubmodality = await createSubmodalityRecord({
      eventId: event.id,
      modalityId: catalog.modality.id,
      name: "Contemporáneo",
    });
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Auditor",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    await expectThrownResponse(
      submitDraftAsAuditor({
        choreographyId: choreography.id,
        edits: { submodalityId: otherSubmodality.id },
      }),
      403,
    );
    await expect(
      db.query.choreographies.findFirst({
        columns: { submodalityId: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toEqual({ submodalityId: catalog.submodality.id });
  });
});

async function createSubmodalityRecord(input: {
  eventId: string;
  modalityId: string;
  name: string;
}) {
  const [submodality] = await db
    .insert(submodalities)
    .values({
      eventId: input.eventId,
      modalityId: input.modalityId,
      name: input.name,
    })
    .returning();

  return submodality;
}
