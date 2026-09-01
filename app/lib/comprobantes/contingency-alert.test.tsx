/** @vitest-environment jsdom */

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";

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
      acknowledged?: boolean;
      onAcknowledge?: () => void;
      onRecheck?: (payload: Record<string, string>) => void;
    } = {},
  ) {
    renderer.render(
      <ContingencyAlert
        acknowledged={overrides.acknowledged ?? false}
        contingency={contingency}
        onAcknowledge={overrides.onAcknowledge ?? (() => {})}
        onRecheck={overrides.onRecheck ?? (() => {})}
        recheckIntent="recheck-comprobante"
      />,
    );
  }

  test("un rechazo muestra los errores y observaciones crudos de ARCA", () => {
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

  test("no emitido presenta el mensaje del server sin afordancias de verificación", () => {
    mount({
      status: "not-emitted",
      message:
        "No pudimos comunicarnos con ARCA: no se emitió el comprobante. Reintentá en unos minutos.",
    });

    expect(document.body.textContent).toContain("no se emitió el comprobante");
    expect(document.body.textContent).not.toContain("Verificar ahora");
    expect(document.body.textContent).not.toContain("Ya verifiqué en ARCA");
  });

  test("no verificado nombra el comprobante y ofrece las dos salidas", () => {
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

  test("verificar ahora manda sólo el intent y el correlativo", async () => {
    const onRecheck = vi.fn();
    mount(
      {
        status: "unverified",
        message: "sin resolver",
        ptoVta: 1,
        cbteTipo: 11,
        cbteNro: 43,
      },
      { onRecheck },
    );

    await clickReactDomButton("Verificar ahora");

    // The amount and the date do NOT travel from the client: the server recomputes
    // them (ADR-0012 decision 4).
    expect(onRecheck).toHaveBeenCalledWith({
      intent: "recheck-comprobante",
      cbteNro: "43",
    });
  });

  test("recuperado dice que quedó registrado y no ofrece reintentar", () => {
    mount({ status: "recovered" });

    expect(document.body.textContent).toContain(
      "ya estaba autorizado en ARCA. Lo recuperamos y quedó registrado",
    );
    expect(document.body.textContent).not.toContain("Verificar ahora");
  });
});

describe("resolveContingencySubmitState", () => {
  test("sin contingencia el submit queda habilitado", () => {
    expect(resolveContingencySubmitState(null, false)).toBe("enabled");
  });

  test("un rechazo o un no emitido dejan reintentar", () => {
    expect(
      resolveContingencySubmitState(
        {
          status: "rejected",
          message: "no",
          resultado: "R",
          errors: [],
          observaciones: [],
        },
        false,
      ),
    ).toBe("enabled");
    expect(
      resolveContingencySubmitState(
        { status: "not-emitted", message: "no se emitió" },
        false,
      ),
    ).toBe("enabled");
  });

  test("no verificado bloquea el submit hasta que el operador declara haber verificado", () => {
    const unverified: ComprobanteContingency = {
      status: "unverified",
      message: "sin resolver",
      ptoVta: 1,
      cbteTipo: 11,
      cbteNro: 43,
    };

    expect(resolveContingencySubmitState(unverified, false)).toBe("blocked");
    expect(resolveContingencySubmitState(unverified, true)).toBe("enabled");
  });

  test("recuperado saca el submit, no lo deshabilita", () => {
    // A disabled button reads as "hold on a moment" and invites a retry; here
    // retrying emits a second fiscal comprobante.
    expect(resolveContingencySubmitState({ status: "recovered" }, false)).toBe(
      "removed",
    );
    expect(contingencyCancelLabel("removed")).toBe("Cerrar");
    expect(contingencyCancelLabel("blocked")).toBe("Cancelar");
  });
});
