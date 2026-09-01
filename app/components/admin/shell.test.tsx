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

describe("AdminShell", () => {
  test("renders administration navigation and the signed-in user context", () => {
    const markup = renderAdminShell();

    expect(markup).toContain("admin@example.com");
    expect(markup).toContain("Inicio");
    expect(markup).not.toContain("Sesión activa para");
    expect(markup).toContain("text-brand");
    expect(markup).toContain("Academias");
    expect(markup).toContain("Profesores");
    expect(markup).toContain("Bailarines");
    expect(markup).toContain("Usuarios");
    expect(markup).toContain("Coreografías");
    expect(markup).toContain("Pagos");
    expect(markup).toContain("Comprobantes");
    expect(markup).not.toContain("Facturas");
    expect(markup).not.toContain('href="/administracion/facturas"');

    // Each group is one of the administrator's jobs.
    expect(markup).toContain("Operación");
    expect(markup).toContain("Finanzas");
    expect(markup).toContain("Bases");
    expect(markup).toContain("Accesos");

    // The order is verified by href because the label is not unique: "Academias"
    // appears under Finanzas (their balance) and under Accesos (the entity).
    const orderedHrefs = [
      "/administracion/eventos",
      "/administracion/coreografias",
      "/administracion/profesores",
      "/administracion/bailarines",
      "/administracion/finanzas",
      "/administracion/pagos",
      "/administracion/comprobantes",
      "/administracion/usuarios",
      "/administracion/academias",
    ];
    const positions = orderedHrefs.map((href) =>
      markup.indexOf(`href="${href}"`),
    );

    expect(positions.filter((position) => position < 0)).toEqual([]);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test("opens Bases navigation only as a collapsible section", () => {
    const markup = renderAdminShell(
      {},
      { initialEntry: "/administracion/eventos" },
    );

    expect(markup).toContain("Eventos");
    expect(markup).toContain("/administracion/eventos");
  });

  test("shows the active Evento without offering a selector", () => {
    const markup = renderAdminShell({
      events: [
        { id: "evento_2025", name: "Evento 2025", active: false },
        { id: "evento_2026", name: "Evento 2026", active: true },
      ],
      selectedEventId: "evento_2026",
    });

    expect(markup).toContain("Evento 2026");
    expect(markup).toContain("Evento activo");
    expect(markup).not.toContain("Cambiar Evento de trabajo");
  });

  test("shows missing active event context without rendering a banner", () => {
    const markup = renderAdminShell({
      events: [],
      selectedEventId: null,
    });

    expect(markup).toContain("Sin evento activo");
    expect(markup).not.toContain("No hay Evento activo");
  });

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

function renderAdminShell(
  props: Partial<Parameters<typeof AdminShell>[0]> = {},
  options: { initialEntry?: string } = {},
) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[options.initialEntry ?? "/administracion"]}>
      <AdminShell
        email="admin@example.com"
        events={[{ id: "evento_2026", name: "Evento 2026", active: true }]}
        selectedEventId="evento_2026"
        {...props}
      >
        <p>Contenido administrativo</p>
      </AdminShell>
    </MemoryRouter>,
  );
}
