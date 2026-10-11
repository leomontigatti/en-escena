import { describe, expect, test } from "vitest";

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

  test("redirects a page, a day the event does not hold, and stale parameters, to the canonical URL", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addPresentation({ name: "Única", orderNumber: 1 });

    const response = await expectThrownResponse(
      loadTheList("?pagina=2&dia=2099-01-01&evento=abc&advertencias=con"),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      "/administracion/presentaciones?advertencias=con",
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
