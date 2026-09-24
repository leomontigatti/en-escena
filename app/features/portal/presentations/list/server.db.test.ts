import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { presentations } from "@/db/schema";
import { loadPortalPresentationsList } from "@/features/portal/presentations/list/server";
import {
  createAcademySession,
  createChoreographyRecord,
  createEventCatalog,
  createEventRecord,
} from "@/features/portal/choreographies/test-support/db";
import { activateEvent } from "@/lib/events/management.server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

function portalPresentationsRequest(cookie: string) {
  return new Request("http://localhost/portal/presentaciones", {
    headers: { cookie },
  });
}

describe("loadPortalPresentationsList", () => {
  test("names each row's level, and leaves it empty when the category declares none", async () => {
    const session = await createAcademySession({
      academyName: "Academia Nivel",
      email: "presentaciones.nivel@example.com",
    });
    const event = await createEventRecord({ name: "Regional 2026" });
    await activateEvent(event.id);
    const catalog = await createEventCatalog(event.id);

    const withLevel = await createChoreographyRecord({
      academyId: session.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Con nivel",
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });
    const withoutLevel = await createChoreographyRecord({
      academyId: session.academyId,
      categoryId: catalog.categoryWithoutLevel.id,
      eventId: event.id,
      modalityId: catalog.modality.id,
      name: "Sin nivel",
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });

    await db.insert(presentations).values([
      { choreographyId: withLevel.id, eventId: event.id, orderNumber: 1 },
      { choreographyId: withoutLevel.id, eventId: event.id, orderNumber: 2 },
    ]);

    const loaderData = await loadPortalPresentationsList(
      portalPresentationsRequest(session.cookie),
    );

    expect(loaderData.rows.map((row) => [row.name, row.levelLabel])).toEqual([
      ["Con nivel", "Amateur"],
      ["Sin nivel", null],
    ]);
  });
});
