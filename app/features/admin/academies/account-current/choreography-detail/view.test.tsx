/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { AdministracionCoreografiaFinancieraDetalleView } from "./view";

describe("AdministracionCoreografiaFinancieraDetalleView", () => {
  test("renders readonly finance cards, choreography fields, and participations", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <AdministracionCoreografiaFinancieraDetalleView
          loaderData={{
            academy: {
              contactName: "Academia Centro",
              id: "academy_1",
              name: "Academia Centro",
              phone: "11-5555-5555",
            },
            choreography: {
              depositAmount: { amount: 3000, status: "complete" },
              depositCompletedOn: "2026-03-21",
              financialState: "señada",
              groupType: "duo",
              id: "choreography_1",
              name: "Aire",
              needsAttention: false,
              owedAmount: { amount: 7000, status: "complete" },
              paidAmount: 3000,
            },
            participations: [
              {
                basePriceAmount: 10000,
                dancerId: "dancer_1",
                discountAmount: 0,
                finalPriceAmount: 10000,
                firstName: "Ana",
                lastName: "López",
              },
            ],
            selectedEventId: "event_1",
          }}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("Detalle financiero");
    expect(markup).not.toContain("Detalle financiero de coreografía");
    expect(markup).not.toContain("Datos de coreografía");
    expect(markup).not.toContain("Participaciones");
    expect(markup).toContain("Seña");
    expect(markup).toContain("Pagado");
    expect(markup).toContain("Saldo");
    expect(markup).toContain('value="Academia Centro"');
    expect(markup).toContain('value="Aire"');
    expect(markup).toContain('value="Dúo"');
    expect(markup).toContain("21 de marzo de 2026");
    expect(markup).toContain("Bailarín");
    expect(markup).toContain("Precio base");
    expect(markup).toContain("Descuento");
    expect(markup).toContain("Precio final");
    expect(markup).toContain("Ana López");
    expect(markup).toContain("Volver");
  });
});
