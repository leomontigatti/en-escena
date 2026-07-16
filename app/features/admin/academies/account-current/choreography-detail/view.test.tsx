/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { AdministracionCoreografiaFinancieraDetalleView } from "./view";

describe("AdministracionCoreografiaFinancieraDetalleView", () => {
  test("renders readonly finance cards, choreography fields, and inscriptions with state", () => {
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
            inscriptions: [
              {
                basePriceAmount: 10000,
                balanceAmount: 7000,
                dancerId: "dancer_1",
                depositAmount: 3000,
                discountAmount: 0,
                finalPriceAmount: 10000,
                firstName: "Ana",
                lastName: "López",
                state: "señada",
              },
            ],
            payments: [],
            canPayDeposit: false,
            canPayBalance: false,
            depositTotal: 3000,
            balanceTotal: 7000,
            selectedEventId: "event_1",
          }}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("Detalle financiero");
    expect(markup).toContain("Estado");
    expect(markup).toContain("Señada");
    expect(markup).toContain('value="Academia Centro"');
    expect(markup).toContain('value="Aire"');
    expect(markup).toContain('value="Dúo"');
    expect(markup).toContain("21 de marzo de 2026");
    expect(markup).toContain("Bailarín");
    expect(markup).toContain("Precio base");
    expect(markup).toContain("Seña");
    expect(markup).toContain("Saldo");
    expect(markup).toContain("Ana López");
    expect(markup).toContain("Volver");
  });
});
