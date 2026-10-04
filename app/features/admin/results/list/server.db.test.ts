import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { events, presentations, scores } from "@/db/schema";
import {
  createSignedInAdminRequest as createSignedInRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import { publishResults } from "@/lib/judging/results.server";
import { activateEvent, deactivateEvent } from "@/lib/events/management.server";
import { createAdminSavedEvent } from "@/lib/events/saved-event-test-support.server";

import { handleResultsListAction, loadResultsListRouteData } from "./server";
import {
  hideResultsIntent,
  publishResultsIntent,
  resultsEventIdFieldName,
} from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const listUrl = "http://localhost/administracion/resultados";

async function loadTheList(
  email: string,
  role: "admin" | "auditor" = "admin",
  requestUrl = listUrl,
) {
  const { request } = await createSignedInRequest({ email, requestUrl, role });

  return await loadResultsListRouteData(request);
}

async function submit(
  email: string,
  intent: string,
  eventId: string,
  role: "admin" | "auditor" = "admin",
) {
  const body = new FormData();
  body.set("intent", intent);
  body.set(resultsEventIdFieldName, eventId);
  const { request } = await createSignedInRequest({
    body,
    email,
    requestUrl: listUrl,
    role,
  });

  return await handleResultsListAction(request);
}

async function score(
  fixture: Awaited<ReturnType<typeof seedJudgingFixture>>,
  presentationId: string,
  values: string[],
) {
  for (const value of values) {
    const { judgeAssignmentId } = await fixture.assignJudge(presentationId);
    await db.insert(scores).values({ judgeAssignmentId, value });
  }
}

describe("the results list", () => {
  test("reads each numbered presentation's live average and award, in running order", async () => {
    const fixture = await seedJudgingFixture();
    const second = await fixture.addPresentation({
      name: "Plata",
      orderNumber: 2,
    });
    const first = await fixture.addPresentation({
      name: "Sin puntaje",
      orderNumber: 1,
    });
    // Two of the panel scored so far: the average is of what is saved.
    await score(fixture, second.presentationId, ["80", "85"]);

    const result = await loadTheList("admin.resultados.lista@example.com");

    expect(result.results).toMatchObject([
      {
        average: null,
        award: null,
        evaluationStatus: "pending",
        id: first.choreographyId,
        orderNumber: 1,
        published: false,
      },
      {
        average: 82.5,
        award: "silver",
        evaluationStatus: "evaluated",
        id: second.choreographyId,
        orderNumber: 2,
        published: false,
      },
    ]);
  });

  test("leaves out a choreography with no presentation yet", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addPresentation({ name: "Numerada", orderNumber: 1 });
    const unnumbered = await fixture.addPresentation({
      name: "Sin número",
      orderNumber: 2,
    });
    await db
      .delete(presentations)
      .where(eq(presentations.id, unnumbered.presentationId));

    const result = await loadTheList("admin.resultados.sin-numero@example.com");

    expect(result.results.map((row) => row.name)).toEqual(["Numerada"]);
    expect(result.totalCount).toBe(1);
  });

  test("reads a disqualified presentation with no average and no award", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Descalificada",
      orderNumber: 1,
    });
    await score(fixture, presentation.presentationId, ["95"]);
    await db
      .update(presentations)
      .set({ disqualifiedAt: new Date() })
      .where(eq(presentations.id, presentation.presentationId));

    const result = await loadTheList(
      "admin.resultados.descalificada@example.com",
    );

    expect(result.results[0]).toMatchObject({
      average: null,
      award: null,
      evaluationStatus: "disqualified",
    });
  });

  test("marks which results the academies see, and only while the event's are out", async () => {
    const fixture = await seedJudgingFixture();
    const published = await fixture.addPresentation({
      name: "Publicada",
      orderNumber: 1,
    });
    const later = await fixture.addPresentation({
      name: "Evaluada después",
      orderNumber: 2,
    });
    await score(fixture, published.presentationId, ["70"]);
    await publishResults(fixture.event.id);
    await score(fixture, later.presentationId, ["70"]);

    const result = await loadTheList("admin.resultados.publicadas@example.com");

    expect(result.results.map((row) => row.published)).toEqual([true, false]);
    expect(result.publication).toMatchObject({
      pendingCount: 1,
      publishedAt: expect.any(Date),
      publishedCount: 1,
    });
  });

  test("filters by day and by search, like the presentations list", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addPresentation({
      name: "Primer día",
      orderNumber: 1,
      scheduledDate: "2026-11-20",
    });
    await fixture.addPresentation({
      name: "Segundo día",
      orderNumber: 2,
      scheduledDate: "2026-11-21",
    });

    const byDay = await loadTheList(
      "admin.resultados.dia@example.com",
      "admin",
      `${listUrl}?dia=2026-11-21`,
    );
    const bySearch = await loadTheList(
      "admin.resultados.busqueda@example.com",
      "admin",
      `${listUrl}?busqueda=primer`,
    );

    expect(byDay.days).toEqual(["2026-11-20", "2026-11-21"]);
    expect(byDay.results.map((row) => row.name)).toEqual(["Segundo día"]);
    expect(bySearch.results.map((row) => row.name)).toEqual(["Primer día"]);
  });
});

describe("the results list route", () => {
  test("lets an auditor read it and withholds the publication", async () => {
    await expect(
      loadTheList("auditor.resultados@example.com", "auditor"),
    ).resolves.toMatchObject({ canPublish: false });
    await expect(
      loadTheList("admin.resultados.puede@example.com"),
    ).resolves.toMatchObject({ canPublish: true });
  });

  test("turns an academy away from the list", async () => {
    const { request } = await createSignedInRequest({
      email: "academia.resultados@example.com",
      requestUrl: listUrl,
      role: "academy",
    });

    await expectThrownResponse(loadResultsListRouteData(request), 403);
  });

  test("publishes the active event's evaluated results and takes them down again", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Descalificada",
      orderNumber: 1,
    });
    await db
      .update(presentations)
      .set({ disqualifiedAt: new Date() })
      .where(eq(presentations.id, presentation.presentationId));

    await expect(
      submit(
        "admin.resultados.publicar@example.com",
        publishResultsIntent,
        fixture.event.id,
      ),
    ).resolves.toMatchObject({
      message: "Se publicaron los resultados de 1 presentación.",
      status: "success",
    });
    await expect(
      db.query.events.findFirst({ where: eq(events.id, fixture.event.id) }),
    ).resolves.toMatchObject({ resultsPublishedAt: expect.any(Date) });

    await expect(
      submit(
        "admin.resultados.ocultar@example.com",
        hideResultsIntent,
        fixture.event.id,
      ),
    ).resolves.toMatchObject({
      message: "Se ocultaron los resultados.",
      status: "success",
    });
    await expect(
      db.query.events.findFirst({ where: eq(events.id, fixture.event.id) }),
    ).resolves.toMatchObject({ resultsPublishedAt: null });
  });

  test("refuses a publication confirmed for an event that is no longer the active one", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Evaluada",
      orderNumber: 1,
    });
    await score(fixture, presentation.presentationId, ["75"]);
    const other = await createAdminSavedEvent({ name: "Otro evento" });
    // Another administrator switches the active event while the confirmation
    // for the first one is still open.
    await deactivateEvent(fixture.event.id);
    await activateEvent(other.id);

    await expect(
      submit(
        "admin.resultados.evento-cambiado@example.com",
        publishResultsIntent,
        fixture.event.id,
      ),
    ).resolves.toMatchObject({
      init: { status: 409 },
      data: { status: "error" },
    });
    await expect(
      db.query.events.findMany({ columns: { resultsPublishedAt: true } }),
    ).resolves.toEqual(
      expect.not.arrayContaining([{ resultsPublishedAt: expect.any(Date) }]),
    );
  });

  test("refuses an auditor's publication submission", async () => {
    const fixture = await seedJudgingFixture();

    for (const intent of [publishResultsIntent, hideResultsIntent]) {
      await expectThrownResponse(
        submit(
          `auditor.${intent}@example.com`,
          intent,
          fixture.event.id,
          "auditor",
        ),
        403,
      );
    }

    await expect(
      db.query.events.findFirst({ where: eq(events.id, fixture.event.id) }),
    ).resolves.toMatchObject({ resultsPublishedAt: null });
  });
});
