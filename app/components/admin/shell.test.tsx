import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import {
  AdminShell,
  getAdminBreadcrumbItems,
  getAdminShellOptions,
} from "@/components/admin/shell";
import type { AdminShellEventContext } from "@/lib/admin/event-context.shared";

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
        loaderData: {
          professor: { firstName: "Ana", lastName: "Pérez" },
        },
        handle: {
          adminBreadcrumbs: [
            (match: AdminBreadcrumbTestMatch) => {
              const data = match.loaderData as
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
        eventContext={{ activeEvent: null }}
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
        "/administracion/movimientos",
        "/administracion/particulares",
        "/administracion/profesores",
        "/administracion/seminarios",
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
        "/administracion/particulares",
        "/administracion/bailarines",
        "/administracion/profesores",
        "/administracion/coreografias",
        "/administracion/movimientos",
      ]),
    );
  });
});

function sidebarSummary(eventContext: AdminShellEventContext) {
  const markup = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/administracion"]}>
      <AdminShell
        account={{ name: "Ada", roleLabel: "Administrador", username: "ada" }}
        canWrite
        eventContext={eventContext}
      />
    </MemoryRouter>,
  );

  return markup.replace(/<[^>]+>/g, " ");
}

// #1808: the sidebar showed "Evento activo" where it promises the `Estado del
// evento`, so a finished event read as if it were running.
describe("the administration sidebar's event status", () => {
  test.each([
    ["not-started", "No iniciado"],
    ["in-progress", "En curso"],
    ["finished", "Finalizado"],
  ] as const)(
    "reads %s as its label, never as `Evento activo`",
    (eventStatus, label) => {
      const text = sidebarSummary({
        activeEvent: { id: "evento_2026", name: "En Escena 2026" },
        eventStatus,
      });

      expect(text).toContain("En Escena 2026");
      expect(text).toContain(label);
      expect(text).toContain("Panel de administración");
      expect(text).not.toContain("Evento activo");
    },
  );

  test("reads `Sin evento activo` without an active event", () => {
    expect(sidebarSummary({ activeEvent: null })).toContain(
      "Sin evento activo",
    );
  });
});
