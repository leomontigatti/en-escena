import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographies, presentations, schedules } from "@/db/schema";
import { loadPortalPresentationsList } from "@/features/portal/presentations/list/server";
import {
  createAcademySession,
  createChoreographyRecord,
  createEventCatalog,
  createEventRecord,
} from "@/features/portal/choreographies/test-support/db";
import { activateEvent } from "@/lib/events/management.server";
import { publishResults } from "@/lib/judging/results.server";
import { hasPublishedPresentations } from "@/lib/presentations/academy-program.server";
import { setVisibleProgramDays } from "@/lib/presentations/program-visibility.server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

function portalPresentationsRequest(cookie: string) {
  return new Request("http://localhost/portal/presentaciones", {
    headers: { cookie },
  });
}

describe("loadPortalPresentationsList", () => {
  test("names each row's level, and words an empty one by why it is empty", async () => {
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

    const missingLevel = await createChoreographyRecord({
      academyId: session.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      modalityId: catalog.modality.id,
      name: "Nivel faltante",
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });
    const grupalWithoutLevel = await createChoreographyRecord({
      academyId: session.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      groupType: "grupal",
      modalityId: catalog.modality.id,
      name: "Grupal sin nivel",
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });

    await db.insert(presentations).values([
      { choreographyId: withLevel.id, eventId: event.id, orderNumber: 1 },
      { choreographyId: withoutLevel.id, eventId: event.id, orderNumber: 2 },
      { choreographyId: missingLevel.id, eventId: event.id, orderNumber: 3 },
      {
        choreographyId: grupalWithoutLevel.id,
        eventId: event.id,
        orderNumber: 4,
      },
    ]);
    await setVisibleProgramDays(event.id, [catalog.schedule.scheduledDate]);

    const loaderData = await loadPortalPresentationsList(
      portalPresentationsRequest(session.cookie),
    );

    expect(loaderData.rows.map((row) => [row.name, row.levelLabel])).toEqual([
      ["Con nivel", "Amateur"],
      ["Sin nivel", "No aplica"],
      ["Nivel faltante", "Sin asignar"],
      ["Grupal sin nivel", "Sin nivel"],
    ]);
  });

  test("reports which rows have a published result and which do not", async () => {
    const session = await createAcademySession({
      academyName: "Academia Resultados",
      email: "presentaciones.resultados@example.com",
    });
    const event = await createEventRecord({ name: "Regional 2026" });
    await activateEvent(event.id);
    const catalog = await createEventCatalog(event.id);

    const evaluated = await createChoreographyRecord({
      academyId: session.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Evaluada",
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });
    const pending = await createChoreographyRecord({
      academyId: session.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Sin evaluar",
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });

    await db.insert(presentations).values([
      { choreographyId: evaluated.id, eventId: event.id, orderNumber: 1 },
      { choreographyId: pending.id, eventId: event.id, orderNumber: 2 },
    ]);
    // Disqualified counts as evaluated, which is the cheapest way to reach the
    // snapshot without a whole panel behind it.
    await db
      .update(presentations)
      .set({ disqualifiedAt: new Date() })
      .where(eq(presentations.choreographyId, evaluated.id));
    await publishResults(event.id);

    const loaderData = await loadPortalPresentationsList(
      portalPresentationsRequest(session.cookie),
    );

    expect(
      loaderData.rows.map((row) => [row.name, row.isResultPublished]),
    ).toEqual([
      ["Evaluada", true],
      ["Sin evaluar", false],
    ]);
  });

  // The number of a day still open to reordering never reaches the page: the
  // loader drops it, so it is not merely hidden by the view.
  test("withholds the number of a choreography on a day not published", async () => {
    const session = await createAcademySession({
      academyName: "Academia Días",
      email: "presentaciones.dias@example.com",
    });
    const event = await createEventRecord({ name: "Regional 2026" });
    await activateEvent(event.id);
    const catalog = await createEventCatalog(event.id);
    const [hiddenDay] = await db
      .insert(schedules)
      .values({
        eventId: event.id,
        name: "Día sin publicar",
        scheduledDate: "2099-12-31",
        startTime: "10:00",
        totalCapacity: 10,
      })
      .returning();

    const shown = await createChoreographyRecord({
      academyId: session.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Visible",
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });
    const hidden = await createChoreographyRecord({
      academyId: session.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Oculta",
      scheduleCapacityId: null,
      scheduleId: hiddenDay.id,
    });

    await db.insert(presentations).values([
      { choreographyId: hidden.id, eventId: event.id, orderNumber: 1 },
      { choreographyId: shown.id, eventId: event.id, orderNumber: 2 },
    ]);

    const beforePublishing = await loadPortalPresentationsList(
      portalPresentationsRequest(session.cookie),
    );

    expect(beforePublishing).toMatchObject({
      hasPublishedPresentations: false,
      hasVisibleDay: false,
    });
    expect(beforePublishing.rows.map((row) => row.orderNumber)).toEqual([
      null,
      null,
    ]);

    await setVisibleProgramDays(event.id, [catalog.schedule.scheduledDate]);

    const loaderData = await loadPortalPresentationsList(
      portalPresentationsRequest(session.cookie),
    );

    expect(loaderData).toMatchObject({
      hasPublishedPresentations: true,
      hasVisibleDay: true,
    });
    expect(loaderData.rows.map((row) => [row.name, row.orderNumber])).toEqual([
      ["Visible", 2],
      ["Oculta", null],
    ]);
    expect(JSON.stringify(loaderData)).not.toContain('"orderNumber":1');
  });
  // A withdrawn presentation keeps its number in the program, so a day whose
  // only number is a withdrawn one has still told the academy something.
  test("counts a withdrawn presentation as published, since it keeps its number", async () => {
    const session = await createAcademySession({
      academyName: "Academia Retirada",
      email: "presentaciones.retirada@example.com",
    });
    const event = await createEventRecord({ name: "Regional 2026" });
    await activateEvent(event.id);
    const catalog = await createEventCatalog(event.id);
    const choreography = await createChoreographyRecord({
      academyId: session.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Retirada",
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });

    await db.insert(presentations).values({
      choreographyId: choreography.id,
      eventId: event.id,
      orderNumber: 1,
    });
    await db
      .update(choreographies)
      .set({ withdrawnAt: new Date() })
      .where(eq(choreographies.id, choreography.id));
    await setVisibleProgramDays(event.id, [catalog.schedule.scheduledDate]);

    await expect(
      hasPublishedPresentations({
        eventId: event.id,
        visibleDays: [catalog.schedule.scheduledDate],
      }),
    ).resolves.toBe(true);
  });
});
