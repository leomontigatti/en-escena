// PROTOTIPO — smoke render descartable.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { loadAcademyDetailPrototype } from "@/features/admin/academies/detail-prototype/server";
import { VariantA } from "@/features/admin/academies/detail-prototype/variant-a";
import { VariantB } from "@/features/admin/academies/detail-prototype/variant-b";
import { VariantC } from "@/features/admin/academies/detail-prototype/variant-c";
import {
  createAcademyFinanceChoreographyFixture,
  createSavedEvent,
  createSignedInRequest,
} from "@/lib/admin/finances/academy-detail-route.test-support";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("prototipo detalle de academia", () => {
  test("las tres variantes renderizan con datos reales", async () => {
    const event = await createSavedEvent();
    const fixture = await createAcademyFinanceChoreographyFixture({
      academyName: "Academia Prototipo",
      choreographyName: "Aire",
      email: "proto@example.com",
      event,
    });
    const academyId = fixture.academy.academy.id;
    const { request } = await createSignedInRequest({
      email: "admin.proto@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/academias/${academyId}?evento=${event.id}`,
    });

    const loaderData = await loadAcademyDetailPrototype({
      request,
      params: { academyId },
    });

    for (const Variant of [VariantA, VariantB, VariantC]) {
      const router = createMemoryRouter(
        [
          {
            path: "/administracion/academias/:academyId",
            element: createElement(Variant, { loaderData }),
          },
        ],
        { initialEntries: [`/administracion/academias/${academyId}`] },
      );

      expect(
        renderToStaticMarkup(createElement(RouterProvider, { router })),
      ).toContain("Academia Prototipo");
    }

    console.log(
      "counts:",
      JSON.stringify(loaderData.counts),
      "| coreografías:",
      loaderData.choreographies.map((row) => row.name).join(", "),
    );
  });
});
