import { describe, expect, test } from "vitest";

import {
  facturaCAprobada,
  facturaCAprobadaConObservaciones,
  facturaCRechazada,
  ultimoAutorizado,
  ultimoAutorizadoVacio,
} from "./fixtures";
import {
  formatArcaMessage,
  parseCreateVoucherResult,
  parseLastVoucher,
} from "./responses";

describe("formatArcaMessage", () => {
  test("adds ARCA's code when there is one", () => {
    expect(formatArcaMessage({ code: 10049, msg: "Faltan fechas" })).toBe(
      "Faltan fechas (código 10049)",
    );
  });

  test("with no code it leaves the message alone", () => {
    expect(formatArcaMessage({ code: 0, msg: "Faltan fechas" })).toBe(
      "Faltan fechas",
    );
  });
});

describe("parseCreateVoucherResult", () => {
  test("extracts CAE, expiry and sequence number from an approved comprobante", () => {
    const parsed = parseCreateVoucherResult(facturaCAprobada);

    expect(parsed.approved).toBe(true);
    expect(parsed.cae).toBe("41124578989845");
    expect(parsed.caeVto).toBe("20260801");
    expect(parsed.cbteNro).toBe(43);
    expect(parsed.cbteFch).toBe("20260722");
    expect(parsed.resultado).toBe("A");
    expect(parsed.errors).toEqual([]);
  });

  test("surfaces the observations of a comprobante approved with reservations", () => {
    const parsed = parseCreateVoucherResult(facturaCAprobadaConObservaciones);

    expect(parsed.approved).toBe(true);
    expect(parsed.cae).toBe("71234567890123");
    expect(parsed.observaciones).toEqual([
      {
        code: 10063,
        msg: "Msg: El campo Condicion Frente al IVA del receptor es obligatorio",
      },
    ]);
  });

  test("marks it not approved and surfaces a rejection's errors", () => {
    const parsed = parseCreateVoucherResult(facturaCRechazada);

    expect(parsed.approved).toBe(false);
    expect(parsed.cae).toBeNull();
    expect(parsed.caeVto).toBeNull();
    expect(parsed.resultado).toBe("R");
    expect(parsed.errors).toEqual([
      {
        code: 10016,
        msg: "El numero o fecha del comprobante no se corresponde con el proximo a autorizar",
      },
    ]);
  });
});

describe("parseLastVoucher", () => {
  test("returns the last authorized number and the next one to request", () => {
    const parsed = parseLastVoucher(ultimoAutorizado);

    expect(parsed.lastCbteNro).toBe(42);
    expect(parsed.nextCbteNro).toBe(43);
    expect(parsed.errors).toEqual([]);
  });

  test("a point of sale with no comprobantes starts at 1", () => {
    const parsed = parseLastVoucher(ultimoAutorizadoVacio);

    expect(parsed.lastCbteNro).toBe(0);
    expect(parsed.nextCbteNro).toBe(1);
  });
});
