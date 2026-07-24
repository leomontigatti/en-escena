import { describe, expect, test } from "vitest";

import {
  buildFacturaCVoucher,
  FACTURA_C_CBTE_TIPO,
  type FacturaCVoucherInput,
} from "./factura-c";

const baseInput: FacturaCVoucherInput = {
  ptoVta: 1,
  cbteNro: 43,
  cbteFch: "20260722",
  importe: 1000,
  condicionIvaReceptorId: 5,
  fchServDesde: "20260801",
  fchServHasta: "20260803",
  fchVtoPago: "20260722",
};

describe("buildFacturaCVoucher", () => {
  test("produce un FECAESolicitar de Factura C (tipo 11) a consumidor final anónimo", () => {
    const voucher = buildFacturaCVoucher(baseInput);

    expect(voucher.CbteTipo).toBe(FACTURA_C_CBTE_TIPO);
    expect(voucher.CantReg).toBe(1);
    expect(voucher.DocTipo).toBe(99);
    expect(voucher.DocNro).toBe(0);
    expect(voucher.CondicionIVAReceptorId).toBe(5);
    expect(voucher.MonCotiz).toBe(1);
  });

  test("se emite como servicio (Concepto 2) con el período de servicio y el vencimiento de pago", () => {
    const voucher = buildFacturaCVoucher(baseInput);

    expect(voucher.Concepto).toBe(2);
    expect(voucher.FchServDesde).toBe("20260801");
    expect(voucher.FchServHasta).toBe("20260803");
    expect(voucher.FchVtoPago).toBe("20260722");
  });

  test("rechaza un período de servicio que termina antes de empezar (FchServHasta < FchServDesde)", () => {
    expect(() =>
      buildFacturaCVoucher({
        ...baseInput,
        fchServDesde: "20260803",
        fchServHasta: "20260801",
      }),
    ).toThrow(/FchServHasta/);
  });

  test("rechaza un vencimiento de pago anterior a la fecha del comprobante (FchVtoPago < CbteFch)", () => {
    expect(() =>
      buildFacturaCVoucher({ ...baseInput, fchVtoPago: "20260721" }),
    ).toThrow(/FchVtoPago/);
  });

  test("exige las tres fechas de servicio juntas o ninguna", () => {
    const { fchVtoPago: _omitted, ...withoutVto } = baseInput;
    expect(() => buildFacturaCVoucher(withoutVto)).toThrow(/juntas o ninguna/);
  });

  test("rechaza una fecha de servicio sin formato ARCA AAAAMMDD", () => {
    expect(() =>
      buildFacturaCVoucher({ ...baseInput, fchServDesde: "2026-08-01" }),
    ).toThrow(/FchServDesde/);
  });

  test("no discrimina IVA: ImpNeto = ImpTotal, el resto de los importes en 0 y sin array <Iva>", () => {
    const voucher = buildFacturaCVoucher({ ...baseInput, importe: 2500 });

    expect(voucher.ImpTotal).toBe(2500);
    expect(voucher.ImpNeto).toBe(2500);
    expect(voucher.ImpTotConc).toBe(0);
    expect(voucher.ImpOpEx).toBe(0);
    expect(voucher.ImpIVA).toBe(0);
    expect(voucher.ImpTrib).toBe(0);
    expect(voucher.Iva).toBeUndefined();
  });

  test("emite en pesos (MonId = PES)", () => {
    expect(buildFacturaCVoucher(baseInput).MonId).toBe("PES");
  });

  test("usa el correlativo recibido con CbteHasta = CbteDesde (validación 10012)", () => {
    const voucher = buildFacturaCVoucher({ ...baseInput, cbteNro: 43 });

    expect(voucher.CbteDesde).toBe(43);
    expect(voucher.CbteHasta).toBe(43);
  });

  test("rechaza una fecha que no tiene formato ARCA AAAAMMDD", () => {
    expect(() =>
      buildFacturaCVoucher({ ...baseInput, cbteFch: "2026-07-22" }),
    ).toThrow(/AAAAMMDD/);
  });

  test("rechaza un importe no entero o no positivo (pesos enteros, sin centavos)", () => {
    expect(() =>
      buildFacturaCVoucher({ ...baseInput, importe: 1000.5 }),
    ).toThrow(/ImpTotal/);
    expect(() => buildFacturaCVoucher({ ...baseInput, importe: 0 })).toThrow(
      /ImpTotal/,
    );
  });

  test("rechaza un correlativo no positivo", () => {
    expect(() => buildFacturaCVoucher({ ...baseInput, cbteNro: 0 })).toThrow(
      /CbteNro/,
    );
  });
});
