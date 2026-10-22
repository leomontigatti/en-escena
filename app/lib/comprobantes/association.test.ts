import { describe, expect, test } from "vitest";

import {
  readComprobanteAssociation,
  type AssociationScopeComprobante,
} from "./association";

function comprobante(
  id: string,
  cbteTipo: number,
  overrides: Partial<AssociationScopeComprobante> = {},
): AssociationScopeComprobante {
  return {
    id,
    cbteTipo,
    ptoVta: 1,
    cbteNro: 1,
    cbteFch: "20261021",
    impTotal: 10000,
    associatedComprobanteId: cbteTipo === 11 ? null : "fc",
    lines: [],
    ...overrides,
  };
}

function line(inscriptionId: string, amount: number) {
  return {
    choreographyInscriptionId: inscriptionId,
    seminarInscriptionId: null,
    amount,
  };
}

const factura = comprobante("fc", 11, {
  lines: [line("ana", 10000), line("beto", 10000)],
});

describe("readComprobanteAssociation", () => {
  test("an invoice lists the notes anchored at it, in emission order", () => {
    const nd = comprobante("nd", 12, { lines: [line("caro", 5000)] });
    const nc = comprobante("nc", 13, { lines: [line("beto", 10000)] });
    const otherFactura = comprobante("fc-2", 11);
    const otherNote = comprobante("nc-2", 13, {
      associatedComprobanteId: "fc-2",
    });

    const association = readComprobanteAssociation(factura, [
      factura,
      nd,
      otherFactura,
      nc,
      otherNote,
    ]);

    expect(association).toEqual({
      role: "factura",
      adjustments: [
        expect.objectContaining({ id: "nd" }),
        expect.objectContaining({ id: "nc" }),
      ],
    });
  });

  test("an invoice nothing amends has no adjustments", () => {
    expect(readComprobanteAssociation(factura, [factura])).toEqual({
      role: "factura",
      adjustments: [],
    });
  });

  test("a note names the invoice it amends", () => {
    const nd = comprobante("nd", 12, { lines: [line("caro", 5000)] });

    expect(readComprobanteAssociation(nd, [factura, nd])).toEqual({
      role: "note",
      factura: expect.objectContaining({ id: "fc" }),
      adjustedDebitNotes: [],
    });
  });

  test("a credit note of what only the invoice billed adjusts no debit note", () => {
    const nd = comprobante("nd", 12, { lines: [line("caro", 5000)] });
    const nc = comprobante("nc", 13, { lines: [line("beto", 10000)] });

    const association = readComprobanteAssociation(nc, [factura, nd, nc]);

    expect(association).toMatchObject({ adjustedDebitNotes: [] });
  });

  // #610: under the star the NC names the invoice in `CbtesAsoc`, and the
  // printed leyenda names the debit note that billed what it credits.
  test("a credit note of what an earlier debit note billed adjusts that debit note", () => {
    const raise = comprobante("nd-raise", 12, {
      cbteNro: 1,
      lines: [line("ana", 2000)],
    });
    const addition = comprobante("nd-addition", 12, {
      cbteNro: 2,
      lines: [line("caro", 5000)],
    });
    const unrelated = comprobante("nd-unrelated", 12, {
      cbteNro: 3,
      lines: [line("dani", 5000)],
    });
    const nc = comprobante("nc", 13, {
      lines: [line("ana", 12000), line("caro", 5000)],
    });

    const association = readComprobanteAssociation(nc, [
      factura,
      raise,
      addition,
      unrelated,
      nc,
    ]);

    expect(association).toMatchObject({
      role: "note",
      factura: { id: "fc" },
      adjustedDebitNotes: [{ id: "nd-raise" }, { id: "nd-addition" }],
    });
  });

  test("a debit note line that took money off the inscription, or one emitted after the credit note, is not what it credits", () => {
    const cheaper = comprobante("nd-cheaper", 12, {
      lines: [line("ana", -1000), line("caro", 3000)],
    });
    const nc = comprobante("nc", 13, { lines: [line("ana", 9000)] });
    const later = comprobante("nd-later", 12, { lines: [line("ana", 4000)] });

    const association = readComprobanteAssociation(nc, [
      factura,
      cheaper,
      nc,
      later,
    ]);

    expect(association).toMatchObject({ adjustedDebitNotes: [] });
  });

  // A credit note signs its lines in its own direction: a negative line bills
  // that inscription more, so it credits nothing a debit note billed.
  test("a credit note line that bills the inscription more adjusts no debit note", () => {
    const raise = comprobante("nd-raise", 12, { lines: [line("ana", 2000)] });
    const nc = comprobante("nc", 13, {
      lines: [line("ana", -1000), line("beto", 5000)],
    });

    const association = readComprobanteAssociation(nc, [factura, raise, nc]);

    expect(association).toMatchObject({ adjustedDebitNotes: [] });
  });

  test("a seminar credit note matches debit notes by the seminar inscription", () => {
    const seminarLine = (inscriptionId: string, amount: number) => ({
      choreographyInscriptionId: null,
      seminarInscriptionId: inscriptionId,
      amount,
    });
    const nd = comprobante("nd", 12, { lines: [seminarLine("eva", 5000)] });
    const nc = comprobante("nc", 13, { lines: [seminarLine("eva", 5000)] });

    expect(readComprobanteAssociation(nc, [factura, nd, nc])).toMatchObject({
      adjustedDebitNotes: [{ id: "nd" }],
    });
  });

  test("a comprobante of an unknown kind has no association", () => {
    const unknown = comprobante("x", 99);

    expect(readComprobanteAssociation(unknown, [factura, unknown])).toBeNull();
  });
});
