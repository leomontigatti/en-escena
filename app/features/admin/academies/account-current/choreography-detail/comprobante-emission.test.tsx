/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { ContingencyAlert } from "./comprobante-emission";

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
