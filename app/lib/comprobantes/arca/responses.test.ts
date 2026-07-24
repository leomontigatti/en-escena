import { describe, expect, test } from "vitest";

import {
  facturaCAprobada,
  facturaCAprobadaConObservaciones,
  facturaCRechazada,
  ultimoAutorizado,
  ultimoAutorizadoVacio,
} from "./fixtures";
import { parseCreateVoucherResult, parseLastVoucher } from "./responses";

describe("parseCreateVoucherResult", () => {
  test("extrae CAE, vencimiento y correlativo de un comprobante aprobado", () => {
    const parsed = parseCreateVoucherResult(facturaCAprobada);

    expect(parsed.approved).toBe(true);
    expect(parsed.cae).toBe("41124578989845");
    expect(parsed.caeVto).toBe("20260801");
    expect(parsed.cbteNro).toBe(43);
    expect(parsed.cbteFch).toBe("20260722");
    expect(parsed.resultado).toBe("A");
    expect(parsed.errors).toEqual([]);
  });

  test("superficializa las observaciones de un comprobante aprobado con reparos", () => {
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

  test("marca no aprobado y superficializa los errores de un rechazo", () => {
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
  test("devuelve el último autorizado y el siguiente a solicitar", () => {
    const parsed = parseLastVoucher(ultimoAutorizado);

    expect(parsed.lastCbteNro).toBe(42);
    expect(parsed.nextCbteNro).toBe(43);
    expect(parsed.errors).toEqual([]);
  });

  test("un punto de venta sin comprobantes arranca en 1", () => {
    const parsed = parseLastVoucher(ultimoAutorizadoVacio);

    expect(parsed.lastCbteNro).toBe(0);
    expect(parsed.nextCbteNro).toBe(1);
  });
});
