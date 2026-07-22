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
  emisorCuit: "30717611590",
  asociado: {
    cbteTipo: 11,
    ptoVta: 1,
    cbteNro: 43,
    cbteFch: "20260701",
  },
};

describe("buildNotaCreditoCVoucher", () => {
  test("produce un FECAESolicitar de Nota de crédito C (tipo 13) a consumidor final", () => {
    const voucher = buildNotaCreditoCVoucher(baseInput);

    expect(voucher.CbteTipo).toBe(NOTA_CREDITO_C_CBTE_TIPO);
    expect(voucher.DocTipo).toBe(99);
    expect(voucher.DocNro).toBe(0);
    expect(voucher.CondicionIVAReceptorId).toBe(5);
  });

  test("es total-only y sin IVA discriminado: ImpNeto = ImpTotal y sin array <Iva>", () => {
    const voucher = buildNotaCreditoCVoucher({ ...baseInput, importe: 12000 });

    expect(voucher.ImpTotal).toBe(12000);
    expect(voucher.ImpNeto).toBe(12000);
    expect(voucher.ImpIVA).toBe(0);
    expect(voucher.Iva).toBeUndefined();
  });

  test("referencia al comprobante que anula vía CbtesAsoc", () => {
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

  test("omite CbteFch en CbtesAsoc cuando el comprobante asociado no lo trae", () => {
    const voucher = buildNotaCreditoCVoucher({
      ...baseInput,
      asociado: { cbteTipo: 11, ptoVta: 1, cbteNro: 43 },
    });

    expect(voucher.CbtesAsoc?.[0]).not.toHaveProperty("CbteFch");
  });

  test("admite una cadena: puede anular otra Nota de crédito (tipo 13)", () => {
    const voucher = buildNotaCreditoCVoucher({
      ...baseInput,
      asociado: { cbteTipo: 13, ptoVta: 1, cbteNro: 8 },
    });

    expect(voucher.CbtesAsoc?.[0]).toMatchObject({ Tipo: 13, Nro: 8 });
  });

  test("hereda las validaciones de la base clase C (importe y fecha)", () => {
    expect(() =>
      buildNotaCreditoCVoucher({ ...baseInput, importe: 0 }),
    ).toThrow(/ImpTotal/);
    expect(() =>
      buildNotaCreditoCVoucher({ ...baseInput, cbteFch: "2026-07-22" }),
    ).toThrow(/AAAAMMDD/);
  });
});
