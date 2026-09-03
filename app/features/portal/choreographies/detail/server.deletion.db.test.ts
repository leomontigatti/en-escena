import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
import { handlePortalChoreographyDetailRouteAction as choreographyDetailAction } from "@/features/portal/choreographies/detail/server";
import {
  createAcademySession,
  createChoreographyRecord,
  createEventCatalog,
  createEventRecord,
} from "@/features/portal/choreographies/test-support/db";
import {
  createPortalPostRequest,
  expectThrownResponse,
} from "@/features/portal/test-support/db";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

function legacyDeleteChoreographyFormData(choreographyId: string) {
  const formData = new FormData();
  formData.set("intent", "delete-choreography");
  formData.set("confirmDeletion", choreographyId);

  return formData;
}

describe.sequential("portal choreography deletion", () => {
  test("falls back to the generic unsupported-intent rejection and keeps the choreography registered", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Sin Eliminación",
      email: "coreografias.detail.delete.removed@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "No eliminable por portal",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    await expectThrownResponse(
      choreographyDetailAction({
        params: { choreographyId: choreography.id },
        request: createPortalPostRequest(
          `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
          owner.cookie,
          legacyDeleteChoreographyFormData(choreography.id),
        ),
      }),
      400,
    );

    await expect(
      db.query.choreographies.findFirst({
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toBeDefined();
  });
});
