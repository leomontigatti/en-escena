import { describe, expect, test } from "vitest";

import {
  comprobanteKindBadgeVariant,
  comprobanteKindCbteTipo,
  comprobantePrintHeader,
  formatComprobanteKindInitials,
  formatComprobanteKindLabel,
  readComprobanteKind,
  signedComprobanteAmount,
} from "./kind";

describe("readComprobanteKind", () => {
  test("maps the three emitted codes to their kinds and back", () => {
    expect(readComprobanteKind(11)).toEqual({ kind: "factura_c" });
    expect(readComprobanteKind(12)).toEqual({ kind: "nota_debito_c" });
    expect(readComprobanteKind(13)).toEqual({ kind: "nota_credito_c" });

    for (const kind of [
      "factura_c",
      "nota_debito_c",
      "nota_credito_c",
    ] as const) {
      expect(readComprobanteKind(comprobanteKindCbteTipo(kind))).toEqual({
        kind,
      });
    }
  });

  test("resolves any other code to the unknown kind carrying the raw number", () => {
    expect(readComprobanteKind(99)).toEqual({ kind: "unknown", cbteTipo: 99 });
  });
});

describe("the kind's presentation", () => {
  test("names each emitted kind in full, by initials and by badge colour", () => {
    expect(
      [11, 12, 13].map((cbteTipo) => [
        formatComprobanteKindLabel(cbteTipo),
        formatComprobanteKindInitials(cbteTipo),
        comprobanteKindBadgeVariant(cbteTipo),
      ]),
    ).toEqual([
      ["Factura C", "FC", "info"],
      ["Nota de débito C", "ND", "secondary"],
      ["Nota de crédito C", "NC", "warning"],
    ]);
  });

  test("an unknown code falls back to the raw number in label, initials, badge and print header", () => {
    expect(formatComprobanteKindLabel(99)).toBe("Comprobante 99");
    expect(formatComprobanteKindInitials(99)).toBe("C99");
    expect(comprobanteKindBadgeVariant(99)).toBe("outline");
    expect(comprobantePrintHeader(99)).toEqual({
      letter: "—",
      code: "099",
      title: "Comprobante 99",
    });
  });

  test("prints each emitted kind under its ARCA code", () => {
    expect(comprobantePrintHeader(11)).toEqual({
      letter: "C",
      code: "011",
      title: "Factura C",
    });
    expect(comprobantePrintHeader(12)).toEqual({
      letter: "C",
      code: "012",
      title: "Nota de Débito C",
    });
    expect(comprobantePrintHeader(13)).toEqual({
      letter: "C",
      code: "013",
      title: "Nota de Crédito C",
    });
  });

  test("a credit note takes its amount off; every other kind adds it", () => {
    expect(
      [11, 12, 13, 99].map((cbteTipo) =>
        signedComprobanteAmount({ cbteTipo, impTotal: 3000 }),
      ),
    ).toEqual([3000, 3000, -3000, 3000]);
  });
});
