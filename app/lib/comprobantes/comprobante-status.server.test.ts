import { describe, expect, test } from "vitest";

import { deriveComprobanteStatus } from "./comprobante-status.server";

const factura = { id: "fc", cbteTipo: 11, impTotal: 1000 };

function amendment(cbteTipo: number, impTotal: number, anchoredAt = "fc") {
  return { associatedComprobanteId: anchoredAt, cbteTipo, impTotal };
}

describe("deriveComprobanteStatus", () => {
  test("an invoice nothing amends is valid", () => {
    expect(deriveComprobanteStatus(factura, [])).toBe("valid");
  });

  test("a debit note adjusts the invoice", () => {
    expect(deriveComprobanteStatus(factura, [amendment(12, 200)])).toBe(
      "adjusted",
    );
  });

  test("a partial credit note adjusts the invoice", () => {
    expect(deriveComprobanteStatus(factura, [amendment(13, 400)])).toBe(
      "adjusted",
    );
  });

  test("credit notes summing to the invoice's total annul it", () => {
    expect(
      deriveComprobanteStatus(factura, [
        amendment(13, 400),
        amendment(13, 600),
      ]),
    ).toBe("annulled");
  });

  test("credit notes must also cover the debit notes to annul", () => {
    expect(
      deriveComprobanteStatus(factura, [
        amendment(12, 200),
        amendment(13, 1000),
      ]),
    ).toBe("adjusted");
    expect(
      deriveComprobanteStatus(factura, [
        amendment(12, 200),
        amendment(13, 1200),
      ]),
    ).toBe("annulled");
  });

  test("only the comprobantes anchored at this invoice count", () => {
    expect(
      deriveComprobanteStatus(factura, [
        amendment(13, 1000, "another-fc"),
        { associatedComprobanteId: null, cbteTipo: 11, impTotal: 1000 },
      ]),
    ).toBe("valid");
  });

  test("an amendment of an unknown kind neither adjusts nor annuls", () => {
    expect(deriveComprobanteStatus(factura, [amendment(99, 1000)])).toBe(
      "valid",
    );
  });

  test("notes and unknown kinds carry no status", () => {
    for (const cbteTipo of [12, 13, 99]) {
      expect(
        deriveComprobanteStatus({ id: "x", cbteTipo, impTotal: 100 }, []),
      ).toBeNull();
    }
  });
});
