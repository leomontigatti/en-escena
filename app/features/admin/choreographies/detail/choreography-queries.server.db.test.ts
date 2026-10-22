import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { presentations } from "@/db/schema";
import { findChoreographyDetail } from "@/features/admin/choreographies/detail/choreography-queries.server";
import {
  createAcademySession,
  createChoreographyRecord,
  createEventCatalog,
  createEventRecord,
} from "@/features/portal/choreographies/test-support/db";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

describe("the administrative choreography detail", () => {
  // Administration works the order before any day is published, so the
  // number the academy does not see yet is already in the name.
  test("names the music download by its order number before the day is published", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Dueña",
      email: "coreografias.admin.audio@example.com",
    });
    const event = await createEventRecord({ name: "Regional Audio" });
    const catalog = await createEventCatalog(event.id);
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      musicStorageKey: "music/tema.wav",
      name: "Tema",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(presentations).values({
      choreographyId: choreography.id,
      eventId: event.id,
      orderNumber: 3,
    });

    const detail = await findChoreographyDetail({
      choreographyId: choreography.id,
      selectedEventId: event.id,
    });

    expect(detail?.musicDownloadFileName).toBe("3 - Tema - Academia Dueña.wav");
  });
});
