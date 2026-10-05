import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import {
  AdminShell,
  getAdminBreadcrumbItems,
  getAdminShellOptions,
} from "@/components/admin/shell";

type AdminBreadcrumbTestMatch = Parameters<
  typeof getAdminBreadcrumbItems
>[0][number];

describe("admin shell route handles", () => {
  test("collects static and dynamic breadcrumbs from route handles", () => {
    const breadcrumbItems = getAdminBreadcrumbItems([
      { params: {} },
      {
        params: {},
        handle: {
          adminBreadcrumbs: [
            { label: "Profesores", to: "/administracion/profesores" },
          ],
        },
      },
      {
        params: {},
        data: {
          professor: { firstName: "Ana", lastName: "Pérez" },
        },
        handle: {
          adminBreadcrumbs: [
            (match: AdminBreadcrumbTestMatch) => {
              const data = match.data as
                | { professor?: { firstName: string; lastName: string } }
                | undefined;

              return data?.professor
                ? {
                    label: `${data.professor.firstName} ${data.professor.lastName}`,
                  }
                : null;
            },
          ],
        },
      },
    ]);

    expect(breadcrumbItems).toEqual([
      { label: "Profesores", to: "/administracion/profesores" },
      { label: "Ana Pérez" },
    ]);
  });

  test("merges shell options from deeper route matches", () => {
    const shellOptions = getAdminShellOptions([
      { params: {}, handle: { adminShell: { showEventSelector: true } } },
      { params: {}, handle: { adminShell: { showEventSelector: false } } },
    ]);

    expect(shellOptions).toEqual({ showEventSelector: false });
  });
});

function navigationLinks(canWrite: boolean) {
  const markup = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/administracion"]}>
      <AdminShell
        account={{ name: "Ana", roleLabel: "Auditor", username: "ana" }}
        canWrite={canWrite}
        events={[]}
        selectedEventId={null}
      />
    </MemoryRouter>,
  );
  return [...markup.matchAll(/href="(\/administracion[^"]*)"/g)].map(
    (match) => match[1],
  );
}

describe("the administration navigation", () => {
  test("shows an auditor exactly the sections reviewed for them", () => {
    expect(navigationLinks(false).sort()).toEqual(
      [
        "/administracion",
        "/administracion/academias",
        "/administracion/bailarines",
        "/administracion/coreografias",
        "/administracion/pagos",
        "/administracion/profesores",
      ].sort(),
    );
  });

  test("shows an administrator every section, as before", () => {
    expect(navigationLinks(true)).toEqual(
      expect.arrayContaining([
        "/administracion/eventos",
        "/administracion/presentaciones",
        "/administracion/resultados",
        "/administracion/seminarios",
        "/administracion/finanzas",
        "/administracion/comprobantes",
        "/administracion/modalidades",
        "/administracion/categorias",
        "/administracion/cronogramas",
        "/administracion/precios",
        "/administracion/usuarios",
        "/administracion/academias",
        "/administracion/bailarines",
        "/administracion/profesores",
        "/administracion/coreografias",
        "/administracion/pagos",
      ]),
    );
  });
});
