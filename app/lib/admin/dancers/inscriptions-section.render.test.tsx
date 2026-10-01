import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/admin/dancers/dancers.server", () => ({
  findDancer: vi.fn(),
  verifyDancerIdentity: vi.fn(),
}));

vi.mock("@/lib/roster/roster-person-status.server", () => ({
  setRosterPersonStatus: vi.fn(),
}));

vi.mock("@/lib/admin/dancers/dancers-update.server", () => ({
  updateAdministrativeDancer: vi.fn(),
}));

vi.mock("@/lib/admin/event-context.server", () => ({
  loadEventContext: vi.fn(),
}));

vi.mock("@/lib/auth/internal-access.server", () => ({
  requireAdminUser: vi.fn(),
  requireInternalUser: vi.fn(),
}));

import {
  InscriptionsSection,
  type InscriptionsSectionProps,
} from "@/routes/administracion.bailarines_.$dancerId";

describe("InscriptionsSection", () => {
  test("shows an empty state when there is no event active", () => {
    const markup = renderSection({
      academyId: "academy-1",
      inscriptions: [],
      selectedEventId: null,
    });

    expect(markup).toContain("Sin evento activo");
    expect(markup).toContain(
      "No hay un evento activo seleccionado para revisar inscripciones.",
    );
  });

  test("shows an empty state when the dancer has no inscriptions in the event active", () => {
    const markup = renderSection({
      academyId: "academy-1",
      inscriptions: [],
      selectedEventId: "event-1",
    });

    expect(markup).toContain(
      "Este bailarín no tiene inscripciones en el evento activo.",
    );
  });

  test("shows active-event inscriptions with the finance columns and values", () => {
    const markup = renderSection({
      academyId: "academy-1",
      selectedEventId: "event-1",
      inscriptions: [
        {
          id: "choreo-1",
          choreographyName: "Finale",
          choreographyNumber: 12,
          eventName: "Evento Activo",
          categoryName: "Juvenil",
          groupType: "duo",
          basePriceAmount: 35000,
          dancerDiscountAmount: 0,
          totalAmount: 35000,
        },
      ],
    });

    expect(markup).toContain("Coreografía");
    expect(markup).toContain("00012");
    expect(markup).toContain(
      'href="/administracion/coreografias/academy-1/choreo-1"',
    );
    expect(markup).toContain("Categoría / Tipo de grupo");
    expect(markup).toContain("Precio base");
    expect(markup).toContain("Descuento");
    expect(markup).toContain("Total");
    expect(markup).not.toContain("Subtotal estimado");
    expect(markup).toContain("Finale");
    expect(markup).toContain("Juvenil · Dúo");
    expect(markup).toContain("35.000");
    expect(markup).not.toContain("350");
    expect(markup).toContain("Evento Activo");
    expect(markup).toContain("Buscar inscripción por coreografía o evento");
    expect(markup).not.toContain(
      "Los importes son estimados y no reemplazan comprobantes financieros.",
    );
  });
});

function renderSection(props: InscriptionsSectionProps) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <InscriptionsSection {...props} />
    </MemoryRouter>,
  );
}
