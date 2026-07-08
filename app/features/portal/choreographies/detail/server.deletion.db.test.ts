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
import { deleteChoreographyFormData } from "@/features/portal/choreographies/test-support/forms";
import {
  createPortalPostRequest,
  expectThrownResponse,
} from "@/features/portal/test-support/db";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("portal choreography deletion", () => {
  test("rejects the legacy academy delete intent and keeps the Coreografía registered", async () => {
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
          deleteChoreographyFormData(choreography.id),
        ),
      }),
      403,
    );

    await expect(
      db.query.choreographies.findFirst({
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toBeDefined();
  });
});
