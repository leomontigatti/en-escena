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
      inscriptions: [],
      selectedEventId: "event-1",
    });

    expect(markup).toContain("Sin inscripciones en el evento activo");
    expect(markup).toContain(
      "Este bailarín no tiene inscripciones en el evento activo.",
    );
  });

  test("shows active-event inscriptions with estimated columns and values", () => {
    const markup = renderSection({
      selectedEventId: "event-1",
      inscriptions: [
        {
          id: "choreo-1",
          choreographyName: "Finale",
          choreographyNumber: 12,
          categoryName: "Juvenil",
          groupType: "duo",
          basePriceAmount: 35000,
          discountAmount: 0,
          estimatedSubtotalAmount: 35000,
        },
      ],
    });

    expect(markup).toContain("Coreografía");
    expect(markup).toContain("00012");
    expect(markup).toContain('href="/administracion/coreografias/choreo-1"');
    expect(markup).toContain("Categoría / Tipo de grupo");
    expect(markup).toContain("Precio base");
    expect(markup).toContain("Descuento");
    expect(markup).toContain("Subtotal estimado");
    expect(markup).toContain("Finale");
    expect(markup).toContain("Juvenil · Dúo");
    expect(markup).toContain("35.000");
    expect(markup).not.toContain("350");
    expect(markup).not.toContain("Buscar coreografía");
    expect(markup).not.toContain("Anterior");
    expect(markup).not.toContain("Siguiente");
    expect(markup).not.toContain("registros");
    expect(markup).not.toContain(
      "Los importes son estimados y no reemplazan comprobantes financieros.",
    );
  });

  test("falls back to an unassigned label when the choreography has no category", () => {
    const markup = renderSection({
      selectedEventId: "event-1",
      inscriptions: [
        {
          id: "choreo-1",
          choreographyName: "Finale",
          choreographyNumber: 12,
          categoryName: null,
          groupType: "solo",
          basePriceAmount: 35000,
          discountAmount: 0,
          estimatedSubtotalAmount: 35000,
        },
      ],
    });

    expect(markup).toContain("Sin asignar · Solo");
  });
});

function renderSection(props: InscriptionsSectionProps) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <InscriptionsSection {...props} />
    </MemoryRouter>,
  );
}
