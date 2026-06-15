import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { AdminShell } from "@/components/admin/shell";

describe("AdminShell", () => {
  test("renders administration navigation and the signed-in user context", () => {
    const markup = renderAdminShell();

    expect(markup).toContain("admin@example.com");
    expect(markup).toContain("Inicio");
    expect(markup).not.toContain("Sesión activa para");
    expect(markup).toContain("Profesores");
    expect(markup).toContain("/administracion/profesores");
    expect(markup).toContain("Bailarines");
    expect(markup).toContain("/administracion/bailarines");
    expect(markup).toContain("Usuarios");
    expect(markup).toContain("/administracion/usuarios");
    expect(markup).toContain("Bases del evento");
    expect(markup).toContain('href="/administracion/eventos"');
    expect(markup.indexOf("Profesores")).toBeLessThan(
      markup.indexOf("Bailarines"),
    );
    expect(markup.indexOf("Bailarines")).toBeLessThan(
      markup.indexOf("Bases del evento"),
    );
    expect(markup.indexOf("Bases del evento")).toBeLessThan(
      markup.indexOf("Usuarios"),
    );
  });

  test("opens Bases del evento navigation only as a collapsible section", () => {
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
        title="Inicio"
        {...props}
      >
        <p>Contenido administrativo</p>
      </AdminShell>
    </MemoryRouter>,
  );
}
