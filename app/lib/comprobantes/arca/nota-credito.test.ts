import { describe, expect, test } from "vitest";

import { NOTA_CREDITO_C_CBTE_TIPO } from "./factura-c";
import {
  buildNotaCreditoCVoucher,
  type NotaCreditoCVoucherInput,
} from "./nota-credito";

const baseInput: NotaCreditoCVoucherInput = {
  ptoVta: 1,
  cbteNro: 8,
  cbteFch: "20260722",
  importe: 7000,
  condicionIvaReceptorId: 5,
  // The credit note mirrors the three dates of the comprobante it annuls: the
  // annulment logic copies them from the original comprobante into the input. The
  // builder still requires `FchVtoPago >= CbteFch` (WSFEv1) on the NC's date.
  fchServDesde: "20260801",
  fchServHasta: "20260803",
  fchVtoPago: "20260722",
  emisorCuit: "30717611590",
  asociado: {
    cbteTipo: 11,
    ptoVta: 1,
    cbteNro: 43,
    cbteFch: "20260701",
  },
};

describe("buildNotaCreditoCVoucher", () => {
  test("produces a FECAESolicitar for a `Nota de crédito C` (type 13) to a final consumer", () => {
    const voucher = buildNotaCreditoCVoucher(baseInput);

    expect(voucher.CbteTipo).toBe(NOTA_CREDITO_C_CBTE_TIPO);
    expect(voucher.DocTipo).toBe(99);
    expect(voucher.DocNro).toBe(0);
    expect(voucher.CondicionIVAReceptorId).toBe(5);
  });

  test("is total-only with no itemized VAT: ImpNeto = ImpTotal and no <Iva> array", () => {
    const voucher = buildNotaCreditoCVoucher({ ...baseInput, importe: 12000 });

    expect(voucher.ImpTotal).toBe(12000);
    expect(voucher.ImpNeto).toBe(12000);
    expect(voucher.ImpIVA).toBe(0);
    expect(voucher.Iva).toBeUndefined();
  });

  test("is a service (Concepto 2) and mirrors the three dates of the comprobante it annuls", () => {
    const voucher = buildNotaCreditoCVoucher(baseInput);

    expect(voucher.Concepto).toBe(2);
    expect(voucher.FchServDesde).toBe("20260801");
    expect(voucher.FchServHasta).toBe("20260803");
    expect(voucher.FchVtoPago).toBe("20260722");
  });

  test("inherits the class C base's service date constraints", () => {
    expect(() =>
      buildNotaCreditoCVoucher({ ...baseInput, fchVtoPago: "20260721" }),
    ).toThrow(/FchVtoPago/);
  });

  test("references the comprobante it annuls via CbtesAsoc", () => {
    const voucher = buildNotaCreditoCVoucher(baseInput);

    expect(voucher.CbtesAsoc).toEqual([
      {
        Tipo: 11,
        PtoVta: 1,
        Nro: 43,
        Cuit: "30717611590",
        CbteFch: "20260701",
      },
    ]);
  });

  test("omits CbteFch in CbtesAsoc when the associated comprobante does not carry it", () => {
    const voucher = buildNotaCreditoCVoucher({
      ...baseInput,
      asociado: { cbteTipo: 11, ptoVta: 1, cbteNro: 43 },
    });

    expect(voucher.CbtesAsoc?.[0]).not.toHaveProperty("CbteFch");
  });

  test("supports a chain: it can annul another credit note (type 13)", () => {
    const voucher = buildNotaCreditoCVoucher({
      ...baseInput,
      asociado: { cbteTipo: 13, ptoVta: 1, cbteNro: 8 },
    });

    expect(voucher.CbtesAsoc?.[0]).toMatchObject({ Tipo: 13, Nro: 8 });
  });

  test("inherits the class C base's validations (amount and date)", () => {
    expect(() =>
      buildNotaCreditoCVoucher({ ...baseInput, importe: 0 }),
    ).toThrow(/ImpTotal/);
    expect(() =>
      buildNotaCreditoCVoucher({ ...baseInput, cbteFch: "2026-07-22" }),
    ).toThrow(/AAAAMMDD/);
  });
});
