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
    expect(markup).toContain("Academias");
    expect(markup).toContain("/administracion/academias");
    expect(markup).toContain("Profesores");
    expect(markup).toContain("/administracion/profesores");
    expect(markup).toContain("Bailarines");
    expect(markup).toContain("/administracion/bailarines");
    expect(markup).toContain("Usuarios");
    expect(markup).toContain("/administracion/usuarios");
    expect(markup).toContain("text-brand");
    expect(markup).toContain("Bases");
    expect(markup).toContain('href="/administracion/eventos"');
    expect(markup).toContain("Coreografías");
    expect(markup).toContain("/administracion/coreografias");
    expect(markup).toContain("Resumen");
    expect(markup).toContain("/administracion/finanzas");
    expect(markup).toContain("Pagos");
    expect(markup).toContain("/administracion/pagos");
    expect(markup).not.toContain("Facturas");
    expect(markup).not.toContain('href="/administracion/facturas"');
    expect(markup.indexOf("Coreografías")).toBeLessThan(
      markup.indexOf("Profesores"),
    );
    expect(markup.indexOf("Profesores")).toBeLessThan(
      markup.indexOf("Bailarines"),
    );
    expect(markup.indexOf("Bailarines")).toBeLessThan(
      markup.indexOf("Resumen"),
    );
    expect(markup.indexOf("Coreografías")).toBeLessThan(
      markup.indexOf("Resumen"),
    );
    expect(markup.indexOf("Resumen")).toBeLessThan(markup.indexOf("Pagos"));
    expect(markup.indexOf("Pagos")).toBeLessThan(markup.indexOf("Bases"));
    expect(markup.indexOf("Bases")).toBeLessThan(markup.indexOf("Usuarios"));
    expect(markup.indexOf("Usuarios")).toBeLessThan(
      markup.indexOf("Academias"),
    );
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
