import { describe, expect, test } from "vitest";

import {
  createSignedInAdminRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";

import { loadPresentationListRouteData } from "./server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

/** What the participation list reads from its URL: search, order and page. */
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

  test("redirects a page past the last one, a day the event does not hold, and stale parameters, to the canonical URL", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addPresentation({ name: "Única", orderNumber: 1 });

    const response = await expectThrownResponse(
      loadTheList("?pagina=5&dia=2099-01-01&evento=abc&advertencias=con"),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      "/administracion/presentacion?advertencias=con",
    );
  });
});

async function loadTheList(search: string) {
  const { request } = await createSignedInAdminRequest({
    email: `presentacion.consulta.${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost/administracion/presentacion${search}`,
    role: "admin",
  });

  return await loadPresentationListRouteData(request);
}
