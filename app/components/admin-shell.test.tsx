import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { AdminShell } from "@/components/admin-shell";

describe("AdminShell", () => {
  test("renders administration navigation and the signed-in user context", () => {
    const markup = renderAdminShell();

    expect(markup).toContain("admin@example.com");
    expect(markup).toContain("Panel de administración");
    expect(markup).toContain("Eventos");
    expect(markup).toContain("/administracion/eventos");
    expect(markup).toContain("Invitaciones");
    expect(markup).toContain("/administracion/usuarios/invitaciones");
    expect(markup).toContain('action="/salir"');
    expect(markup).toContain('method="post"');
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
    ).toContain("Operación limitada");
  });
});

function renderAdminShell(
  props: Partial<Parameters<typeof AdminShell>[0]> = {},
) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/administracion"]}>
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
