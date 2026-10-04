import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { loadProfessorsList } from "@/features/admin/professors/list/server";
import { ProfessorsListRouteView } from "@/features/admin/professors/list/view";
import { createSignedInAdminRequest } from "@/lib/admin/test-support/db";

import { seedPeriodExportFixture } from "./period-export.test-support";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

async function listRequest(path: string, role: "admin" | "auditor") {
  const { request } = await createSignedInAdminRequest({
    email: `${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost${path}`,
    role,
  });

  return request;
}

function render(path: string, element: ReactElement) {
  const router = createMemoryRouter([{ path, element }], {
    initialEntries: [path],
  });

  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}

/** Whether the list's header carries the actions menu that holds `Exportar`. */
function offersExportMenu(markup: string) {
  return markup.includes('aria-label="Acciones"');
}

const lists = [
  {
    label: "Profesores",
    path: "/administracion/profesores",
    renderList: async (request: Request) =>
      render(
        "/administracion/profesores",
        createElement(ProfessorsListRouteView, {
          loaderData: await loadProfessorsList(request),
        }),
      ),
  },
];

describe("the auditor's export entry on the lists", () => {
  test.each(lists)(
    "renders on $label for an auditor and not for an administrator",
    async ({ path, renderList }) => {
      await seedPeriodExportFixture();

      expect(
        offersExportMenu(await renderList(await listRequest(path, "auditor"))),
      ).toBe(true);
      expect(
        offersExportMenu(await renderList(await listRequest(path, "admin"))),
      ).toBe(false);
    },
  );
});
