import { describe, expect, test } from "vitest";

import {
  planAnchorEmission,
  type DocumentedComprobante,
} from "./emission-plan";

const factura = (
  impTotal: number,
  lines: Array<[string, number]>,
  id = "fc",
): DocumentedComprobante => ({
  id,
  cbteTipo: 11,
  impTotal,
  associatedComprobanteId: null,
  lines: lines.map(([inscriptionId, amount]) => ({ inscriptionId, amount })),
});

const note = (
  cbteTipo: 12 | 13,
  impTotal: number,
  lines: Array<[string, number]>,
  associatedComprobanteId = "fc",
): DocumentedComprobante => ({
  id: `note-${cbteTipo}-${impTotal}`,
  cbteTipo,
  impTotal,
  associatedComprobanteId,
  lines: lines.map(([inscriptionId, amount]) => ({ inscriptionId, amount })),
});

describe("planAnchorEmission — the first document", () => {
  test("bills the full price of every inscription once the unit is `Señada`", () => {
    expect(
      planAnchorEmission({
        financialStatus: "depositMet",
        inscriptions: [
          { id: "a", owed: 10000 },
          { id: "b", owed: 8000 },
        ],
        comprobantes: [],
      }),
    ).toEqual({
      ok: true,
      kind: "factura_c",
      amount: 18000,
      lines: [
        { inscriptionId: "a", amount: 10000 },
        { inscriptionId: "b", amount: 8000 },
      ],
    });
  });

  test("is refused below `Señada`", () => {
    expect(
      planAnchorEmission({
        financialStatus: "depositPending",
        inscriptions: [{ id: "a", owed: 10000 }],
        comprobantes: [],
      }),
    ).toMatchObject({ ok: false, reason: "below-deposit" });
  });

  test("is refused at a zero total even when the unit reads `Señada`", () => {
    expect(
      planAnchorEmission({
        financialStatus: "paidInFull",
        inscriptions: [{ id: "a", owed: 0 }],
        comprobantes: [],
      }),
    ).toMatchObject({ ok: false, reason: "nothing-to-bill" });
  });

  test("is refused at a zero total on an empty roster, which reads `Seña pendiente`", () => {
    expect(
      planAnchorEmission({
        financialStatus: "depositPending",
        inscriptions: [],
        comprobantes: [],
      }),
    ).toMatchObject({ ok: false, reason: "nothing-to-bill" });
  });

  test("is refused at a zero total when every inscription is waived", () => {
    expect(
      planAnchorEmission({
        financialStatus: "waived",
        inscriptions: [{ id: "a", owed: 0 }],
        comprobantes: [],
      }),
    ).toMatchObject({ ok: false, reason: "nothing-to-bill" });
  });

  test("leaves a zero line out of the invoice", () => {
    expect(
      planAnchorEmission({
        financialStatus: "depositMet",
        inscriptions: [
          { id: "a", owed: 10000 },
          { id: "waived", owed: 0 },
        ],
        comprobantes: [],
      }),
    ).toMatchObject({
      ok: true,
      lines: [{ inscriptionId: "a", amount: 10000 }],
    });
  });
});

describe("planAnchorEmission — the delta after the invoice", () => {
  test("an addition owes one debit note anchored at the invoice", () => {
    expect(
      planAnchorEmission({
        // An unpaid dancer pulls the unit below `Señada`: the ND has no gate.
        financialStatus: "depositPending",
        inscriptions: [
          { id: "a", owed: 10000 },
          { id: "new", owed: 10000 },
        ],
        comprobantes: [factura(10000, [["a", 10000]])],
      }),
    ).toEqual({
      ok: true,
      kind: "nota_debito_c",
      amount: 10000,
      factura: factura(10000, [["a", 10000]]),
      lines: [{ inscriptionId: "new", amount: 10000 }],
    });
  });

  test("a withdrawal owes a partial credit note for the line less what was retained", () => {
    expect(
      planAnchorEmission({
        financialStatus: "depositMet",
        inscriptions: [
          { id: "a", owed: 10000 },
          // Withdrawn, retaining its 3000 deposit: that is what it owes now.
          { id: "gone", owed: 3000 },
        ],
        comprobantes: [
          factura(20000, [
            ["a", 10000],
            ["gone", 10000],
          ]),
        ],
      }),
    ).toMatchObject({
      ok: true,
      kind: "nota_credito_c",
      amount: 7000,
      lines: [{ inscriptionId: "gone", amount: 7000 }],
    });
  });

  test("a withdrawal that makes the remaining dancers dearer owes a debit note", () => {
    // Three dancers billed at 9000; one withdraws retaining 5000, and the
    // smaller group the other two are left in is priced at 12000 each.
    expect(
      planAnchorEmission({
        financialStatus: "depositMet",
        inscriptions: [
          { id: "a", owed: 12000 },
          { id: "b", owed: 12000 },
          { id: "gone", owed: 5000 },
        ],
        comprobantes: [
          factura(27000, [
            ["a", 9000],
            ["b", 9000],
            ["gone", 9000],
          ]),
        ],
      }),
    ).toEqual({
      ok: true,
      kind: "nota_debito_c",
      amount: 2000,
      factura: expect.objectContaining({ id: "fc" }),
      // The ND carries every inscription that moved, the withdrawn one with
      // the sign of a credit, so its lines still sum to its total.
      lines: [
        { inscriptionId: "a", amount: 3000 },
        { inscriptionId: "b", amount: 3000 },
        { inscriptionId: "gone", amount: -4000 },
      ],
    });
  });

  test("nothing is owed when the documented total matches the derived one", () => {
    expect(
      planAnchorEmission({
        financialStatus: "depositMet",
        inscriptions: [
          { id: "a", owed: 10000 },
          { id: "new", owed: 5000 },
        ],
        comprobantes: [
          factura(10000, [["a", 10000]]),
          note(12, 8000, [["new", 8000]]),
          note(13, 3000, [["new", 3000]]),
        ],
      }),
    ).toMatchObject({ ok: false, reason: "nothing-owed" });
  });

  test("is refused while an inscription has no price, since nothing says what it owes", () => {
    expect(
      planAnchorEmission({
        financialStatus: "depositPending",
        inscriptions: [
          { id: "a", owed: 10000 },
          { id: "unpriced", owed: null },
        ],
        comprobantes: [factura(10000, [["a", 10000]])],
      }),
    ).toMatchObject({ ok: false, reason: "unpriced" });
  });
});

describe("planAnchorEmission — the crediting ceiling", () => {
  test("refuses a credit note that would take ΣNC past FC + ΣND", () => {
    // A unit holding two invoices from the collection-driven model: the delta
    // is −1500, and crediting it at the first invoice (1000) breaks the
    // ceiling ARCA does not police (#686).
    expect(
      planAnchorEmission({
        financialStatus: "depositMet",
        inscriptions: [{ id: "a", owed: 500 }],
        comprobantes: [
          factura(1000, [["a", 1000]], "fc"),
          factura(1000, [["a", 1000]], "fc-2"),
        ],
      }),
    ).toMatchObject({ ok: false, reason: "over-credit" });
  });

  test("lets ΣNC reach exactly FC + ΣND, which annuls the invoice", () => {
    expect(
      planAnchorEmission({
        financialStatus: "paidInFull",
        inscriptions: [{ id: "gone", owed: 0 }],
        comprobantes: [
          factura(10000, [["gone", 10000]]),
          note(12, 2000, [["gone", 2000]]),
        ],
      }),
    ).toMatchObject({ ok: true, kind: "nota_credito_c", amount: 12000 });
  });
});
