import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { loadAcademiesList } from "@/features/admin/academies/list/server";
import { AcademiesListRouteView } from "@/features/admin/academies/list/view";
import { loadChoreographyListRouteData } from "@/features/admin/choreographies/list/server";
import { ChoreographiesListRouteView } from "@/features/admin/choreographies/list/view";
import { loadPaymentsList } from "@/features/admin/payments/list/server";
import { PaymentsListRouteView } from "@/features/admin/payments/list/view";
import { loadDancersList } from "@/features/admin/dancers/list/server";
import { DancersListRouteView } from "@/features/admin/dancers/list/view";
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
  return /Acciones<\/button>/.test(markup);
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
  {
    label: "Bailarines",
    path: "/administracion/bailarines",
    renderList: async (request: Request) =>
      render(
        "/administracion/bailarines",
        createElement(DancersListRouteView, {
          loaderData: await loadDancersList(request),
        }),
      ),
  },
  {
    label: "Academias",
    path: "/administracion/academias",
    renderList: async (request: Request) =>
      render(
        "/administracion/academias",
        createElement(AcademiesListRouteView, {
          loaderData: await loadAcademiesList(request),
        }),
      ),
  },
  {
    label: "Coreografías",
    path: "/administracion/coreografias",
    renderList: async (request: Request) =>
      render(
        "/administracion/coreografias",
        createElement(ChoreographiesListRouteView, {
          loaderData: await loadChoreographyListRouteData(request),
        }),
      ),
  },
  {
    label: "Pagos",
    path: "/administracion/pagos",
    renderList: async (request: Request) =>
      render(
        "/administracion/pagos",
        createElement(PaymentsListRouteView, {
          loaderData: await loadPaymentsList(request),
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
