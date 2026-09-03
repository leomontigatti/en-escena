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
  test("produces a FECAESolicitar for a invoice C (type 11) to an anonymous final consumer", () => {
    const voucher = buildFacturaCVoucher(baseInput);

    expect(voucher.CbteTipo).toBe(FACTURA_C_CBTE_TIPO);
    expect(voucher.CantReg).toBe(1);
    expect(voucher.DocTipo).toBe(99);
    expect(voucher.DocNro).toBe(0);
    expect(voucher.CondicionIVAReceptorId).toBe(5);
    expect(voucher.MonCotiz).toBe(1);
  });

  test("is emitted as a service (Concepto 2) with the service period and the payment due date", () => {
    const voucher = buildFacturaCVoucher(baseInput);

    expect(voucher.Concepto).toBe(2);
    expect(voucher.FchServDesde).toBe("20260801");
    expect(voucher.FchServHasta).toBe("20260803");
    expect(voucher.FchVtoPago).toBe("20260722");
  });

  test("rejects a service period that ends before it starts (FchServHasta < FchServDesde)", () => {
    expect(() =>
      buildFacturaCVoucher({
        ...baseInput,
        fchServDesde: "20260803",
        fchServHasta: "20260801",
      }),
    ).toThrow(/FchServHasta/);
  });

  test("rejects a payment due date earlier than the comprobante date (FchVtoPago < CbteFch)", () => {
    expect(() =>
      buildFacturaCVoucher({ ...baseInput, fchVtoPago: "20260721" }),
    ).toThrow(/FchVtoPago/);
  });

  test("requires all three service dates together or none at all", () => {
    const { fchVtoPago: _omitted, ...withoutVto } = baseInput;
    expect(() => buildFacturaCVoucher(withoutVto)).toThrow(/juntas o ninguna/);
  });

  test("rejects a service date that is not in ARCA's AAAAMMDD format", () => {
    expect(() =>
      buildFacturaCVoucher({ ...baseInput, fchServDesde: "2026-08-01" }),
    ).toThrow(/FchServDesde/);
  });

  test("does not itemize VAT: ImpNeto = ImpTotal, every other amount at 0 and no <Iva> array", () => {
    const voucher = buildFacturaCVoucher({ ...baseInput, importe: 2500 });

    expect(voucher.ImpTotal).toBe(2500);
    expect(voucher.ImpNeto).toBe(2500);
    expect(voucher.ImpTotConc).toBe(0);
    expect(voucher.ImpOpEx).toBe(0);
    expect(voucher.ImpIVA).toBe(0);
    expect(voucher.ImpTrib).toBe(0);
    expect(voucher.Iva).toBeUndefined();
  });

  test("emits in pesos (MonId = PES)", () => {
    expect(buildFacturaCVoucher(baseInput).MonId).toBe("PES");
  });

  test("uses the sequence number it was given with CbteHasta = CbteDesde (validation 10012)", () => {
    const voucher = buildFacturaCVoucher({ ...baseInput, cbteNro: 43 });

    expect(voucher.CbteDesde).toBe(43);
    expect(voucher.CbteHasta).toBe(43);
  });

  test("rejects a date that is not in ARCA's AAAAMMDD format", () => {
    expect(() =>
      buildFacturaCVoucher({ ...baseInput, cbteFch: "2026-07-22" }),
    ).toThrow(/AAAAMMDD/);
  });

  test("rejects a non-integer or non-positive amount (whole pesos, no cents)", () => {
    expect(() =>
      buildFacturaCVoucher({ ...baseInput, importe: 1000.5 }),
    ).toThrow(/ImpTotal/);
    expect(() => buildFacturaCVoucher({ ...baseInput, importe: 0 })).toThrow(
      /ImpTotal/,
    );
  });

  test("rejects a non-positive sequence number", () => {
    expect(() => buildFacturaCVoucher({ ...baseInput, cbteNro: 0 })).toThrow(
      /CbteNro/,
    );
  });
});
