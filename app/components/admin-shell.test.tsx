import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { AdminShell } from "@/components/admin-shell";

describe("AdminShell", () => {
  test("renders administration navigation and the signed-in user context", () => {
    const markup = renderAdminShell();

    expect(markup).toContain("admin@example.com");
    expect(markup).toContain("Panel de administración");
    expect(markup).toContain("Profesores");
    expect(markup).toContain("/administracion/profesores");
    expect(markup).toContain("Bailarines");
    expect(markup).toContain("/administracion/bailarines");
    expect(markup).toContain("Invitaciones");
    expect(markup).toContain("/administracion/usuarios/invitaciones");
    expect(markup).toContain("Ajustes");
    expect(markup).not.toContain('href="/administracion/ajustes"');
    expect(markup).toContain('action="/salir"');
    expect(markup).toContain('method="post"');
    expect(markup.indexOf("Profesores")).toBeLessThan(
      markup.indexOf("Bailarines"),
    );
    expect(markup.indexOf("Bailarines")).toBeLessThan(
      markup.indexOf("Ajustes"),
    );
    expect(markup.indexOf("Ajustes")).toBeLessThan(
      markup.indexOf("Invitaciones"),
    );
  });

  test("opens Ajustes navigation only as a collapsible section", () => {
    const markup = renderAdminShell(
      {},
      { initialEntry: "/administracion/ajustes/eventos" },
    );

    expect(markup).toContain("Eventos");
    expect(markup).toContain("/administracion/ajustes/eventos");
  });

  test("defaults the Evento de trabajo selector to the active Evento", () => {
    const markup = renderAdminShell({
      events: [
        { id: "evento_2025", name: "Evento 2025", active: false },
        { id: "evento_2026", name: "Evento 2026", active: true },
      ],
      selectedEventId: "evento_2026",
    });

    expect(markup).toContain("Evento de trabajo");
    expect(markup).toContain('name="evento"');
    expect(markup).toContain('value="evento_2026" selected="">Evento 2026');
  });

  test("shows missing and limited event context states", () => {
    expect(
      renderAdminShell({
        events: [],
        selectedEventId: null,
      }),
    ).toContain("No hay evento activo");

    expect(
      renderAdminShell({
        events: [{ id: "evento_2025", name: "Evento 2025", active: false }],
        selectedEventId: "evento_2025",
      }),
    ).toContain("no es el Evento activo");
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
