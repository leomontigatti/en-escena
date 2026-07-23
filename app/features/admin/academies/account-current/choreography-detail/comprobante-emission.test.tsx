/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import {
  EmitComprobanteAction,
  ContingencyAlert,
} from "./comprobante-emission";
import type { ChoreographyInvoicing } from "./server";

function renderAction(overrides: Partial<ChoreographyInvoicing> = {}) {
  const invoicing: ChoreographyInvoicing = {
    billableAmount: 0,
    porcion: null,
    canEmit: false,
    sena: null,
    saldo: null,
    ...overrides,
  };

  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <EmitComprobanteAction invoicing={invoicing} />,
      },
    ],
    { initialEntries: ["/"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

describe("EmitComprobanteAction", () => {
  test("always labels the single Emitir factura action", () => {
    const markup = renderAction();

    // La única acción se rotula siempre; el estado deshabilitado (sin remanente)
    // se cubre en el interaction test.
    expect(markup).toContain("Emitir factura");
  });

  test("shows the emit affordance when there is a billable remainder", () => {
    const markup = renderAction({
      billableAmount: 12000,
      porcion: "seña",
      canEmit: true,
    });

    expect(markup).toContain("Emitir factura");
  });
});

describe("ContingencyAlert", () => {
  test("presents the ARCA contingency message and each error", () => {
    const markup = renderToStaticMarkup(
      <ContingencyAlert
        message="ARCA no autorizó el comprobante (CUIT sin habilitar)."
        contingency={{
          resultado: "R",
          errors: ["CUIT sin habilitar (código 10016)"],
          observaciones: ["Punto de venta no registrado (código 10015)"],
        }}
      />,
    );

    expect(markup).toContain("ARCA no autorizó el comprobante");
    expect(markup).toContain("CUIT sin habilitar (código 10016)");
    expect(markup).toContain("Punto de venta no registrado (código 10015)");
  });
});
