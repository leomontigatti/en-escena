import { describe, expect, test } from "vitest";

import { readComprobanteEmissionConfig } from "@/lib/comprobantes/emit-comprobante.server";

describe("readComprobanteEmissionConfig", () => {
  test("reads the point of sale, the issuer CUIT and the recipient's VAT condition", () => {
    const config = readComprobanteEmissionConfig({
      ARCA_PTOVTA: "1",
      ARCA_CUIT: "30717611590",
      ARCA_CONDICION_IVA_RECEPTOR_ID: "5",
    });

    expect(config).toEqual({
      ptoVta: 1,
      issuerCuit: "30717611590",
      receptorIvaConditionId: 5,
    });
  });

  test("rejects a point of sale that is not a positive integer", () => {
    expect(() =>
      readComprobanteEmissionConfig({
        ARCA_PTOVTA: "0",
        ARCA_CUIT: "30717611590",
        ARCA_CONDICION_IVA_RECEPTOR_ID: "5",
      }),
    ).toThrow(/ARCA_PTOVTA/);
  });

  test("requires the issuer's CUIT", () => {
    expect(() =>
      readComprobanteEmissionConfig({
        ARCA_PTOVTA: "1",
        ARCA_CONDICION_IVA_RECEPTOR_ID: "5",
      }),
    ).toThrow(/ARCA_CUIT/);
  });
});
