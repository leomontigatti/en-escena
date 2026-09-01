import { describe, expect, test } from "vitest";

import {
  toComprobanteContingency,
  toContingencyActionData,
} from "./contingency-view";

describe("toComprobanteContingency", () => {
  test("a rejection carries the raw result and the already formatted messages", () => {
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

  test("a rejection with no detail from ARCA invents nothing", () => {
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

  test("not emitted carries only the server message", () => {
    expect(
      toComprobanteContingency({
        reason: "not-emitted",
        message: "no se emitió",
      }),
    ).toEqual({ status: "not-emitted", message: "no se emitió" });
  });

  test("unverified carries the comprobante that could not be resolved", () => {
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
  test("unverified with no `attempt` never reaches the contingency surface", () => {
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
  test("an ARCA contingency travels as one", () => {
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

  test("anything that is not a contingency falls through to the generic error with its message", () => {
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
