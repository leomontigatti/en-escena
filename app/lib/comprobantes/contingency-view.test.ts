import { describe, expect, test } from "vitest";

import {
  toComprobanteContingency,
  toContingencyActionData,
} from "./contingency-view";

describe("toComprobanteContingency", () => {
  test("un rechazo lleva el resultado crudo y los mensajes ya formateados", () => {
    expect(
      toComprobanteContingency({
        reason: "rejected",
        message: "ARCA no autorizó el comprobante (CUIT sin habilitar).",
        arca: {
          resultado: "R",
          errors: [{ code: 10016, msg: "CUIT sin habilitar" }],
          observaciones: [{ code: 10015, msg: "Punto de venta no registrado" }],
        },
      }),
    ).toEqual({
      status: "rejected",
      message: "ARCA no autorizó el comprobante (CUIT sin habilitar).",
      resultado: "R",
      errors: ["CUIT sin habilitar (código 10016)"],
      observaciones: ["Punto de venta no registrado (código 10015)"],
    });
  });

  test("un rechazo sin detalle de ARCA no inventa nada", () => {
    expect(
      toComprobanteContingency({ reason: "rejected", message: "no" }),
    ).toEqual({
      status: "rejected",
      message: "no",
      resultado: null,
      errors: [],
      observaciones: [],
    });
  });

  test("no emitido sólo lleva el mensaje del server", () => {
    expect(
      toComprobanteContingency({
        reason: "not-emitted",
        message: "no se emitió",
      }),
    ).toEqual({ status: "not-emitted", message: "no se emitió" });
  });

  test("no verificado lleva el comprobante que no se pudo resolver", () => {
    expect(
      toComprobanteContingency({
        reason: "unverified",
        message: "sin resolver",
        attempt: { ptoVta: 1, cbteTipo: 11, cbteNro: 43 },
      }),
    ).toEqual({
      status: "unverified",
      message: "sin resolver",
      ptoVta: 1,
      cbteTipo: 11,
      cbteNro: 43,
    });
  });

  // Without a sequence number the alert could offer neither of the two ways out —
  // neither re-verifying nor verifying in the portal — so it degrades to a generic
  // error instead of blocking the submit without saying what to go and look at.
  test("no verificado sin `attempt` no llega a la superficie de contingencia", () => {
    expect(
      toComprobanteContingency({
        reason: "unverified",
        message: "sin resolver",
      }),
    ).toBeNull();
  });

  // None of this is an ARCA contingency: it neither enables nor blocks retries.
  test.each(["not-found", "nothing-to-bill", "already-annulled"])(
    "`%s` es un error genérico, no una contingencia",
    (reason) => {
      expect(toComprobanteContingency({ reason, message: "no" })).toBeNull();
    },
  );
});

describe("toContingencyActionData", () => {
  test("una contingencia de ARCA viaja como tal", () => {
    expect(
      toContingencyActionData({
        reason: "not-emitted",
        message: "no se emitió",
      }),
    ).toEqual({
      status: "contingency",
      contingency: { status: "not-emitted", message: "no se emitió" },
    });
  });

  test("lo que no es contingencia cae al error genérico con su mensaje", () => {
    expect(
      toContingencyActionData({
        reason: "already-annulled",
        message: "El comprobante ya está anulado.",
      }),
    ).toEqual({
      status: "error",
      message: "El comprobante ya está anulado.",
    });
  });
});
