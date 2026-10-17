import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { presentations } from "@/db/schema";
import { withdrawChoreographyForTest } from "@/lib/choreographies/withdrawn-choreography.test-support";
import { adminListPageSize } from "@/lib/admin/admin-list";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { expectThrownResponse } from "@/lib/test-support/http";

import { loadPresentationListRouteData } from "./server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

/**
 * What the participation list reads from its URL: search and order. It is
 * never paged, so ordering a day sees every row at once.
 */
describe("the participation list's query", () => {
  test("finds a presentation whatever accents the search is typed with", async () => {
    const fixture = await seedJudgingFixture();
    const accentedPresentation = await fixture.addPresentation({
      name: "Canción",
      orderNumber: 1,
    });
    await fixture.addPresentation({ name: "Vals", orderNumber: 2 });

    const result = await loadTheList("?busqueda=CANCION");

    expect(result.presentations.map((row) => row.id)).toEqual([
      accentedPresentation.choreographyId,
    ]);
  });

  // A number is matched whole, so 12 does not bring presentation 2 along.
  test("reads each row's experience-level requirement from its category and group", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addPresentation({
      experienceLevelId: null,
      name: "Solista",
      orderNumber: 1,
    });
    await fixture.addPresentation({
      experienceLevelId: null,
      groupType: "grupal",
      name: "Grupo",
      orderNumber: 2,
    });
    await fixture.addPresentation({
      categoryId: fixture.catalog.categoryWithoutLevel.id,
      experienceLevelId: null,
      name: "Sin niveles",
      orderNumber: 3,
    });

    const result = await loadTheList("");

    expect(
      result.presentations.map((row) => [
        row.name,
        row.experienceLevelRequirement,
      ]),
    ).toEqual([
      ["Solista", "required"],
      ["Grupo", "optional"],
      ["Sin niveles", "notApplicable"],
    ]);
  });

  test("finds a presentation by its own number", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addPresentation({ name: "Vals", orderNumber: 2 });
    const twelfth = await fixture.addPresentation({
      name: "Tango",
      orderNumber: 12,
    });

    const result = await loadTheList("?busqueda=12");

    expect(result.presentations.map((row) => row.id)).toEqual([
      twelfth.choreographyId,
    ]);
  });

  test("narrows the list to the choreographies evaluated as professional", async () => {
    const fixture = await seedJudgingFixture();
    const asked = await fixture.addPresentation({
      name: "Exigente",
      orderNumber: 1,
      professionalEvaluation: true,
    });
    await fixture.addPresentation({ name: "Regular", orderNumber: 2 });

    const result = await loadTheList("?evaluacion=profesional");

    expect(result.filters.evaluation).toBe("profesional");
    expect(result.presentations.map((row) => row.id)).toEqual([
      asked.choreographyId,
    ]);
    expect(result.presentations[0]).toMatchObject({
      professionalEvaluation: true,
    });
  });

  // `orden` is both the parameter and the running-order column's id.
  test("keeps sorting the running order descending from an `orden:desc` link", async () => {
    const fixture = await seedJudgingFixture();
    const first = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
    });
    const second = await fixture.addPresentation({
      name: "Segunda",
      orderNumber: 2,
    });

    const result = await loadTheList("?orden=orden%3Adesc");

    expect(result.presentations.map((row) => row.id)).toEqual([
      second.choreographyId,
      first.choreographyId,
    ]);
  });

  test("lists every presentation, past what a page of an admin list holds", async () => {
    const fixture = await seedJudgingFixture();

    for (
      let orderNumber = 1;
      orderNumber <= adminListPageSize + 1;
      orderNumber++
    ) {
      await fixture.addPresentation({
        name: `Pieza ${orderNumber}`,
        orderNumber,
      });
    }

    const result = await loadTheList("");

    expect(result.presentations).toHaveLength(adminListPageSize + 1);

    // A link made while the list was paged names a page that is no more.
    const response = await expectThrownResponse(loadTheList("?pagina=2"), 302);

    expect(response.headers.get("Location")).toBe(
      "/administracion/presentaciones",
    );
  });

  // There is no tab for every day: a URL naming none is the first day's list,
  // and the counter reads it against the whole day, not the event.
  test("opens on the event's first day and counts the rows of the day", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addPresentation({
      name: "Primer día",
      orderNumber: 1,
      scheduledDate: "2026-11-20",
    });
    await fixture.addPresentation({
      name: "Primer día, tarde",
      orderNumber: 2,
      scheduledDate: "2026-11-20",
    });
    await fixture.addPresentation({
      name: "Segundo día",
      orderNumber: 3,
      scheduledDate: "2026-11-21",
    });

    const opening = await loadTheList("");
    const searched = await loadTheList("?busqueda=tarde");

    expect(opening.filters.day).toBe("2026-11-20");
    expect(opening.presentations.map((row) => row.name)).toEqual([
      "Primer día",
      "Primer día, tarde",
    ]);
    expect(opening.dayRowCount).toBe(2);
    expect(searched.presentations.map((row) => row.name)).toEqual([
      "Primer día, tarde",
    ]);
    expect(searched.dayRowCount).toBe(2);

    // The first day is the absence of the parameter, as on the tabs.
    const response = await expectThrownResponse(
      loadTheList("?dia=2026-11-20"),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      "/administracion/presentaciones",
    );
  });

  // A withdrawn presentation keeps its place in the order, so it is listed with
  // no filter; one withdrawn before it had a number has no place, and only the
  // `Retirada` answer of `Estado` reaches it.
  test("lists a withdrawn presentation in place, and reaches one never numbered through `Retirada`", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addPresentation({ name: "En escena", orderNumber: 1 });
    const numbered = await fixture.addPresentation({
      name: "Retirada numerada",
      orderNumber: 2,
    });
    const unnumbered = await fixture.addPresentation({
      name: "Retirada sin número",
      orderNumber: 3,
    });
    await db
      .delete(presentations)
      .where(eq(presentations.id, unnumbered.presentationId));
    await withdrawChoreographyForTest(numbered.choreographyId);
    await withdrawChoreographyForTest(unnumbered.choreographyId);

    const everyRow = await loadTheList("");
    const withdrawn = await loadTheList("?estado=retirada");

    expect(everyRow.presentations.map((row) => row.name)).toEqual([
      "En escena",
      "Retirada numerada",
    ]);
    expect(everyRow.unorderedCount).toBe(0);
    expect(withdrawn.filters.status).toBe("retirada");
    expect(withdrawn.presentations.map((row) => row.name)).toEqual([
      "Retirada numerada",
      "Retirada sin número",
    ]);
  });

  // A choreography withdrawn before it had a number has no place in the order:
  // its day is no tab and it is nothing to order, until `Retirada` asks for it.
  test("opens no tab and offers no ordering for a choreography withdrawn before it had a number", async () => {
    const fixture = await seedJudgingFixture();
    const withdrawn = await fixture.addPresentation({
      name: "Retirada sin número",
      orderNumber: 1,
      scheduledDate: "2026-11-20",
    });
    await db
      .delete(presentations)
      .where(eq(presentations.id, withdrawn.presentationId));
    await withdrawChoreographyForTest(withdrawn.choreographyId);

    const onlyWithdrawn = await loadTheList("");

    expect(onlyWithdrawn.days).toEqual([]);
    expect(onlyWithdrawn.hasOrderableRow).toBe(false);

    await fixture.addPresentation({
      name: "En escena",
      orderNumber: 2,
      scheduledDate: "2026-11-21",
    });

    const opening = await loadTheList("");
    const withdrawnOnly = await loadTheList("?estado=retirada");

    expect(opening.days).toEqual(["2026-11-21"]);
    expect(opening.presentations.map((row) => row.name)).toEqual(["En escena"]);
    expect(opening.hasOrderableRow).toBe(true);
    expect(withdrawnOnly.days).toEqual(["2026-11-20", "2026-11-21"]);
    // The ordering is offered only the days it has something to order on.
    expect(withdrawnOnly.orderableDays).toEqual(["2026-11-21"]);
    expect(withdrawnOnly.presentations.map((row) => row.name)).toEqual([
      "Retirada sin número",
    ]);
  });

  // Each answer of `Estado` keeps the rows whose badge reads it: a row the
  // panel judged reads its evaluation, never the warnings it still carries.
  test("narrows the list to the rows whose badge reads the status chosen", async () => {
    const fixture = await seedJudgingFixture();
    // A solo with no level, where its category requires one, is warned.
    await fixture.addPresentation({
      experienceLevelId: null,
      name: "Advertida",
      orderNumber: 1,
    });
    const disqualified = await fixture.addPresentation({
      experienceLevelId: null,
      name: "Descalificada",
      orderNumber: 2,
    });
    await db
      .update(presentations)
      .set({ disqualifiedAt: new Date("2026-10-10T23:00:00Z") })
      .where(eq(presentations.id, disqualified.presentationId));

    const warned = await loadTheList("?estado=advertencias");
    const settled = await loadTheList("?estado=descalificada");

    expect(warned.presentations.map((row) => row.name)).toEqual(["Advertida"]);
    expect(warned.warnedCount).toBe(1);
    expect(settled.presentations.map((row) => row.name)).toEqual([
      "Descalificada",
    ]);
  });

  // The notice's `Ver` narrows the day on screen, so it counts that day only:
  // an event-wide count would send the reader to an empty list.
  test("counts the warned presentations of the day on screen", async () => {
    const fixture = await seedJudgingFixture();

    // A schedule the fixture makes for a date has no price, so each row is
    // `Seña pendiente`: one warned row a day, two in the event.
    for (const [orderNumber, scheduledDate] of [
      [1, "2026-11-20"],
      [2, "2026-11-21"],
    ] as const) {
      await fixture.addPresentation({
        name: `Día ${orderNumber}`,
        orderNumber,
        scheduledDate,
      });
    }

    const firstDay = await loadTheList("");
    const secondDay = await loadTheList("?dia=2026-11-21");

    expect(firstDay.warnedCount).toBe(1);
    expect(secondDay.warnedCount).toBe(1);
  });

  test("redirects a page, a day the event does not hold, and stale parameters, to the canonical URL", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addPresentation({ name: "Única", orderNumber: 1 });

    const response = await expectThrownResponse(
      loadTheList(
        "?pagina=2&dia=2099-01-01&evento=abc&advertencias=con&estado=advertencias",
      ),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      "/administracion/presentaciones?estado=advertencias",
    );
  });
});

async function loadTheList(search: string) {
  const { request } = await createSignedInRequest({
    email: `presentacion.consulta.${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost/administracion/presentaciones${search}`,
    role: "admin",
  });

  return await loadPresentationListRouteData(request);
}
