import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/admin/dancers/dancers.server", () => ({
  findAdministrativeDancer: vi.fn(),
  setAdministrativeDancerActiveState: vi.fn(),
  updateAdministrativeDancer: vi.fn(),
  verifyAdministrativeDancerIdentity: vi.fn(),
}));

vi.mock("@/lib/admin/event-context.server", () => ({
  loadAdminEventContext: vi.fn(),
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
  test("shows an empty state when there is no Evento activo", () => {
    const markup = renderSection({
      inscriptions: [],
      selectedEventId: null,
    });

    expect(markup).toContain("Sin evento activo");
    expect(markup).toContain(
      "No hay un evento activo seleccionado para revisar inscripciones.",
    );
  });

  test("shows an empty state when the Bailarín has no inscriptions in the Evento activo", () => {
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
          groupType: "duo",
          basePriceInCents: 1250000,
          discountInCents: 0,
          estimatedSubtotalInCents: 1250000,
        },
      ],
    });

    expect(markup).toContain("Nombre coreografía");
    expect(markup).toContain("Tipo de grupo");
    expect(markup).toContain("Precio base");
    expect(markup).toContain("Descuento");
    expect(markup).toContain("Subtotal estimado");
    expect(markup).toContain("Finale");
    expect(markup).toContain("Dúo");
    expect(markup).toContain("12.500");
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
