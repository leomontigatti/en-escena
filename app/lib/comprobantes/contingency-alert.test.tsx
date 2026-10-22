/** @vitest-environment jsdom */

import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import {
  ContingencyAlert,
  contingencyCancelLabel,
  resolveContingencySubmitState,
  type ComprobanteContingency,
} from "./contingency-alert";

describe("ContingencyAlert", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  function mount(
    contingency: ComprobanteContingency,
    overrides: {
      onSubmit?: (payload: Record<string, string>) => void;
    } = {},
  ) {
    renderer.render(
      <ContingencyAlert
        abandonIntent="abandon-reservation"
        contingency={contingency}
        onSubmit={overrides.onSubmit ?? (() => {})}
        recheckIntent="recheck-comprobante"
      />,
    );
  }

  test("a rejection shows ARCA's raw errors and observations", () => {
    mount({
      status: "rejected",
      message: "ARCA no autorizó el comprobante (CUIT sin habilitar).",
      resultado: "R",
      errors: ["CUIT sin habilitar (código 10016)"],
      observaciones: ["Punto de venta no registrado (código 10015)"],
    });

    expect(document.body.textContent).toContain("ARCA no autorizó");
    expect(document.body.textContent).toContain(
      "CUIT sin habilitar (código 10016)",
    );
    expect(document.body.textContent).toContain(
      "Punto de venta no registrado (código 10015)",
    );
    // Nothing to verify: ARCA responded, nothing was generated and retrying cannot
    // duplicate.
    expect(document.body.textContent).not.toContain("Verificar ahora");
  });

  test("not emitted presents the server message with no verification affordances", () => {
    mount({
      status: "not-emitted",
      message:
        "No pudimos comunicarnos con ARCA: no se emitió el comprobante. Reintentá en unos minutos.",
    });

    expect(document.body.textContent).toContain("no se emitió el comprobante");
    expect(document.body.textContent).not.toContain("Verificar ahora");
    expect(document.body.textContent).not.toContain("Ya verifiqué en ARCA");
  });

  test("unverified names the comprobante and offers both ways out", () => {
    mount({
      status: "unverified",
      message:
        "Se cortó la comunicación con ARCA (Factura C 0001-00000043). Verificá ese comprobante en ARCA antes de reintentar.",
      ptoVta: 1,
      cbteTipo: 11,
      cbteNro: 43,
    });

    expect(document.body.textContent).toContain("Factura C 0001-00000043");
    expect(document.body.textContent).toContain("Verificar ahora");
    expect(document.body.textContent).toContain("Ya verifiqué en ARCA");
  });

  test("recovered says it was recorded and does not offer a retry", () => {
    mount({ status: "recovered" });

    expect(document.body.textContent).toContain(
      "ya estaba autorizado en ARCA. Lo recuperamos y quedó registrado",
    );
    expect(document.body.textContent).not.toContain("Verificar ahora");
  });
});

describe("resolveContingencySubmitState", () => {
  test("with no contingency the submit stays enabled", () => {
    expect(resolveContingencySubmitState(null)).toBe("enabled");
  });

  test("a rejection or a not-emitted result allow a retry", () => {
    expect(
      resolveContingencySubmitState({
        status: "rejected",
        message: "no",
        resultado: "R",
        errors: [],
        observaciones: [],
      }),
    ).toBe("enabled");
    expect(
      resolveContingencySubmitState({
        status: "not-emitted",
        message: "no se emitió",
      }),
    ).toBe("enabled");
  });

  test("a live reservation blocks the submit until the server resolves or releases it", () => {
    const attempt = {
      message: "sin resolver",
      ptoVta: 1,
      cbteTipo: 11,
      cbteNro: 43,
    };

    expect(
      resolveContingencySubmitState({ status: "unverified", ...attempt }),
    ).toBe("blocked");
    expect(
      resolveContingencySubmitState({ status: "number-taken", ...attempt }),
    ).toBe("blocked");
    expect(resolveContingencySubmitState({ status: "released" })).toBe(
      "enabled",
    );
  });

  test("recovered removes the submit, it does not disable it", () => {
    // A disabled button reads as "hold on a moment" and invites a retry; here
    // retrying emits a second fiscal comprobante.
    expect(resolveContingencySubmitState({ status: "recovered" })).toBe(
      "removed",
    );
    expect(contingencyCancelLabel("removed")).toBe("Cerrar");
    expect(contingencyCancelLabel("blocked")).toBe("Cancelar");
  });
});
