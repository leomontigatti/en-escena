import { describe, expect, test } from "vitest";

import { deriveAnchorBilling, type BilledInscription } from "./anchor-billing";
import type { DocumentedComprobante } from "./emission-plan";

const factura = (
  impTotal: number,
  lines: Array<[string, number]>,
): DocumentedComprobante => ({
  id: "fc",
  cbteTipo: 11,
  impTotal,
  associatedComprobanteId: null,
  lines: lines.map(([inscriptionId, amount]) => ({ inscriptionId, amount })),
});

const note = (
  cbteTipo: 12 | 13,
  impTotal: number,
  lines: Array<[string, number]>,
): DocumentedComprobante => ({
  id: `note-${cbteTipo}-${impTotal}`,
  cbteTipo,
  impTotal,
  associatedComprobanteId: "fc",
  lines: lines.map(([inscriptionId, amount]) => ({ inscriptionId, amount })),
});

const active = (id: string, owed: number | null): BilledInscription => ({
  id,
  owed,
  withdrawnAt: null,
});

// Córdoba is UTC−3: 15:00Z is midday there, the same business date.
const withdrawn = (
  id: string,
  owed: number,
  withdrawnOn: string,
): BilledInscription => ({
  id,
  owed,
  withdrawnAt: new Date(`${withdrawnOn}T15:00:00Z`),
});

const today = "2026-10-22";

describe("deriveAnchorBilling", () => {
  test("says nothing about a unit that holds no invoice", () => {
    expect(
      deriveAnchorBilling({
        inscriptions: [active("a", 10000)],
        comprobantes: [],
        today,
      }),
    ).toBeNull();
  });

  test("an invoice that matches what is owed raises no anomaly and marks no row", () => {
    expect(
      deriveAnchorBilling({
        inscriptions: [active("a", 10000), active("b", 8000)],
        comprobantes: [
          factura(18000, [
            ["a", 10000],
            ["b", 8000],
          ]),
        ],
        today,
      }),
    ).toEqual({
      anomaly: null,
      amount: 0,
      creditClockDays: null,
      documentedAmount: 18000,
      owedAmount: 18000,
      uninvoicedInscriptionIds: [],
    });
  });

  test("a dancer added after invoicing leaves a debit pending and reads `Sin facturar`", () => {
    expect(
      deriveAnchorBilling({
        inscriptions: [active("a", 10000), active("new", 8000)],
        comprobantes: [factura(10000, [["a", 10000]])],
        today,
      }),
    ).toMatchObject({
      anomaly: "pendingDebitNote",
      amount: 8000,
      creditClockDays: null,
      uninvoicedInscriptionIds: ["new"],
    });
  });

  test("the debit note that names the added dancer clears both", () => {
    expect(
      deriveAnchorBilling({
        inscriptions: [active("a", 10000), active("new", 8000)],
        comprobantes: [
          factura(10000, [["a", 10000]]),
          note(12, 8000, [["new", 8000]]),
        ],
        today,
      }),
    ).toMatchObject({ anomaly: null, uninvoicedInscriptionIds: [] });
  });

  test("a withdrawal leaves a credit pending, counted from the withdrawal", () => {
    // The withdrawn row retains its 3000 deposit, so 7000 of its line is owed
    // back.
    expect(
      deriveAnchorBilling({
        inscriptions: [active("a", 10000), withdrawn("b", 3000, "2026-10-19")],
        comprobantes: [
          factura(20000, [
            ["a", 10000],
            ["b", 10000],
          ]),
        ],
        today,
      }),
    ).toMatchObject({
      anomaly: "pendingCreditNote",
      amount: 7000,
      creditClockDays: 3,
    });
  });

  test("the clock runs from the oldest withdrawal whose credit is still owed", () => {
    expect(
      deriveAnchorBilling({
        inscriptions: [
          withdrawn("credited", 3000, "2026-10-01"),
          withdrawn("pending", 3000, "2026-10-12"),
        ],
        comprobantes: [
          factura(20000, [
            ["credited", 10000],
            ["pending", 10000],
          ]),
          note(13, 7000, [["credited", 7000]]),
        ],
        today,
      }),
    ).toMatchObject({ anomaly: "pendingCreditNote", creditClockDays: 10 });
  });

  test("keeps counting past the fifteen days: lateness stays legible", () => {
    expect(
      deriveAnchorBilling({
        inscriptions: [withdrawn("b", 0, "2026-09-30")],
        comprobantes: [factura(10000, [["b", 10000]])],
        today,
      }),
    ).toMatchObject({ creditClockDays: 22 });
  });

  test("the credit note for the withdrawal clears the anomaly and its clock", () => {
    expect(
      deriveAnchorBilling({
        inscriptions: [withdrawn("b", 3000, "2026-10-19")],
        comprobantes: [
          factura(10000, [["b", 10000]]),
          note(13, 7000, [["b", 7000]]),
        ],
        today,
      }),
    ).toMatchObject({ anomaly: null, creditClockDays: null });
  });

  test("a withdrawal that retains everything leaves the delta at zero and shows nothing", () => {
    expect(
      deriveAnchorBilling({
        inscriptions: [withdrawn("b", 10000, "2026-10-19")],
        comprobantes: [factura(10000, [["b", 10000]])],
        today,
      }),
    ).toMatchObject({ anomaly: null, amount: 0, creditClockDays: null });
  });

  test("a discount that moved after invoicing leaves a credit pending with no clock", () => {
    expect(
      deriveAnchorBilling({
        inscriptions: [active("a", 9000)],
        comprobantes: [factura(10000, [["a", 10000]])],
        today,
      }),
    ).toMatchObject({
      anomaly: "pendingCreditNote",
      amount: 1000,
      creditClockDays: null,
    });
  });

  test("a withdrawal producing a debit, because the others got dearer, carries no clock", () => {
    // The clock belongs to a credit owed; a debit owed is never a "devolución".
    expect(
      deriveAnchorBilling({
        inscriptions: [active("a", 12000), withdrawn("b", 10000, "2026-10-19")],
        comprobantes: [
          factura(20000, [
            ["a", 10000],
            ["b", 10000],
          ]),
        ],
        today,
      }),
    ).toMatchObject({
      anomaly: "pendingDebitNote",
      amount: 2000,
      creditClockDays: null,
    });
  });

  test("a row added after invoicing that owes nothing has nothing to invoice", () => {
    // A waived dancer's next note would carry no line for it, so a `Sin
    // facturar` there would never clear.
    expect(
      deriveAnchorBilling({
        inscriptions: [active("a", 10000), active("waived", 0)],
        comprobantes: [factura(10000, [["a", 10000]])],
        today,
      }),
    ).toMatchObject({ anomaly: null, uninvoicedInscriptionIds: [] });
  });

  test("an unpriced row names no anomaly, since the total is unknown, but is still not invoiced", () => {
    expect(
      deriveAnchorBilling({
        inscriptions: [active("a", 10000), active("unpriced", null)],
        comprobantes: [factura(10000, [["a", 10000]])],
        today,
      }),
    ).toMatchObject({
      anomaly: null,
      amount: 0,
      uninvoicedInscriptionIds: ["unpriced"],
    });
  });
});
