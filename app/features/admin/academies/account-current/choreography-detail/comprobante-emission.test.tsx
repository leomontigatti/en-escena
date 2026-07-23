/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { ContingencyAlert } from "@/features/admin/comprobantes/contingency-alert";

import { ComprobantesSection } from "./comprobante-emission";
import type { ChoreographyInvoicing } from "./server";

function renderSection(overrides: Partial<ChoreographyInvoicing> = {}) {
  const invoicing: ChoreographyInvoicing = {
    billableAmount: 0,
    canEmit: false,
    currency: null,
    lastComprobante: null,
    ...overrides,
  };

  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <ComprobantesSection invoicing={invoicing} />,
      },
    ],
    { initialEntries: ["/"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

describe("ComprobantesSection", () => {
  test("announces that no comprobante has been issued yet", () => {
    const markup = renderSection();

    expect(markup).toContain("todavía no tiene comprobantes emitidos");
    expect(markup).not.toContain("Emitir comprobante");
  });

  test("shows the emit affordance when there is a billable remainder", () => {
    const markup = renderSection({ billableAmount: 12000, canEmit: true });

    expect(markup).toContain("Emitir comprobante");
  });

  test("marks the last comprobante as Vigente when nothing new is billable", () => {
    const markup = renderSection({
      currency: "vigente",
      lastComprobante: lastComprobanteFixture(),
    });

    expect(markup).toContain("Vigente");
    expect(markup).not.toContain("Desactualizada");
    expect(markup).toContain("0001-00000007");
    expect(markup).toContain("CAE 74123456789012");
  });

  test("marks the last comprobante as Desactualizada when new money is unbilled", () => {
    const markup = renderSection({
      billableAmount: 3000,
      canEmit: true,
      currency: "desactualizada",
      lastComprobante: lastComprobanteFixture(),
    });

    expect(markup).toContain("Desactualizada");
    expect(markup).not.toContain(">Vigente<");
  });

  test("flags an annulled last comprobante", () => {
    const markup = renderSection({
      lastComprobante: lastComprobanteFixture({ status: "anulada" }),
    });

    expect(markup).toContain("Anulada por nota de crédito");
  });
});

describe("ContingencyAlert", () => {
  test("presents a rejection with each ARCA message and the retry-is-safe copy", () => {
    const markup = renderToStaticMarkup(
      <ContingencyAlert
        message="ARCA no autorizó el comprobante (CUIT sin habilitar)."
        contingency={{
          kind: "rejected",
          resultado: "R",
          errors: ["CUIT sin habilitar (código 10016)"],
          observaciones: ["Punto de venta no registrado (código 10015)"],
        }}
      />,
    );

    expect(markup).toContain("ARCA no autorizó el comprobante");
    expect(markup).toContain("CUIT sin habilitar (código 10016)");
    expect(markup).toContain("Punto de venta no registrado (código 10015)");
    expect(markup).toContain("No se generó ningún comprobante");
    expect(markup).toContain("sin riesgo de duplicar");
  });

  test("distinguishes a lookup timeout, where nothing could have been issued", () => {
    const markup = renderToStaticMarkup(
      <ContingencyAlert
        message="No pudimos comunicarnos con ARCA."
        contingency={{
          kind: "unreachable",
          stage: "lookup",
          detail: "socket hang up",
        }}
      />,
    );

    expect(markup).toContain("No se generó ningún comprobante.");
    expect(markup).not.toContain("sin riesgo de duplicar");
  });

  test("warns against a blind retry when the authorization call timed out", () => {
    const markup = renderToStaticMarkup(
      <ContingencyAlert
        message="Se cortó la comunicación con ARCA."
        contingency={{
          kind: "unreachable",
          stage: "authorization",
          detail: "ETIMEDOUT",
        }}
      />,
    );

    expect(markup).toContain("No reintentes sin verificar antes en ARCA");
    expect(markup).not.toContain("No se generó ningún comprobante");
  });
});

function lastComprobanteFixture(
  overrides: Partial<
    NonNullable<ChoreographyInvoicing["lastComprobante"]>
  > = {},
): NonNullable<ChoreographyInvoicing["lastComprobante"]> {
  return {
    id: "comprobante_1",
    ptoVta: 1,
    cbteNro: 7,
    cbteFch: "20260722",
    impTotal: 12000,
    cae: "74123456789012",
    status: "vigente",
    ...overrides,
  };
}
