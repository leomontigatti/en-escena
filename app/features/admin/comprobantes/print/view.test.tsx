/** @vitest-environment jsdom */

import { describe, expect, test } from "vitest";

import type { AssociatedComprobante } from "@/lib/comprobantes/association";

import {
  buildComprobantePrintViewModel,
  type ComprobantePrintRecord,
} from "./model";
import { renderComprobantePrintDocument } from "./view";

// A stable QR snapshot: the printout injects the SVG as is, so the HTML snapshot
// is not tied to the QR's matrix (validated separately in arca/qr.test).
const QR_SVG_STUB = '<svg data-testid="qr-stub"></svg>';

function associated(
  overrides: Partial<AssociatedComprobante> = {},
): AssociatedComprobante {
  return {
    id: "factura_1",
    cbteTipo: 11,
    ptoVta: 3,
    cbteNro: 7,
    cbteFch: "20260722",
    impTotal: 25000,
    ...overrides,
  };
}

function printRecord(
  overrides: Partial<ComprobantePrintRecord> = {},
): ComprobantePrintRecord {
  return {
    id: "comprobante_1",
    academyId: "academy_1",
    choreographyId: "choreo_1",
    seminarId: null,
    eventId: "event_1",
    cbteTipo: 11,
    ptoVta: 3,
    cbteNro: 7,
    cbteFch: "20260722",
    fchServDesde: null,
    fchServHasta: null,
    fchVtoPago: null,
    impTotal: 25000,
    issuerCuit: "30717611590",
    issuerIvaCondition: "exento",
    receptorDocTipo: 99,
    receptorDocNro: "0",
    receptorIvaConditionId: 5,
    cae: "11112222333344",
    caeVto: "20260801",
    associatedComprobanteId: null,
    createdAt: new Date("2026-07-22T12:00:00Z"),
    lines: [
      {
        id: "line_1",
        description: "Inscripción — Ana López",
        amount: 15000,
        withdrawn: true,
      },
      {
        id: "line_2",
        description: "Inscripción — Bruno Díaz",
        amount: 10000,
        withdrawn: false,
      },
    ],
    association: { role: "factura", adjustments: [] },
    anchor: {
      kind: "choreography",
      choreographyId: "choreo_1",
      choreographyName: "Coreografía Alfa",
    },
    academyName: "Academia Alfa",
    eventName: "Certamen 2026",
    ...overrides,
  };
}

/**
 * The same snapshot anchored at a `(seminar, academy)` unit: the seminar's own
 * date on both ends of the service period and the payment due date equal to the
 * issue date, which is what the emitter freezes for a seminar.
 */
function seminarPrintRecord(
  overrides: Partial<ComprobantePrintRecord> = {},
): ComprobantePrintRecord {
  return printRecord({
    choreographyId: null,
    seminarId: "seminar_1",
    anchor: {
      kind: "seminar",
      seminarId: "seminar_1",
      instructorName: "Abril Sosa",
      scheduledDate: "2030-10-10",
    },
    fchServDesde: "20301010",
    fchServHasta: "20301010",
    fchVtoPago: "20260722",
    lines: [
      {
        id: "line_1",
        description: "Inscripción — Eva Ruiz",
        amount: 25000,
        withdrawn: false,
      },
    ],
    ...overrides,
  });
}

describe("buildComprobantePrintViewModel", () => {
  test("projects the comprobante snapshot with #334's numbering and legends", () => {
    const model = buildComprobantePrintViewModel(printRecord());

    expect(model.number).toBe("0003-00000007");
    expect(model.header.title).toBe("Factura C");
    expect(model.header.letter).toBe("C");
    expect(model.header.code).toBe("011");
    expect(model.issueDate).toBe("22/07/2026");
    expect(model.caeVto).toBe("01/08/2026");
    expect(model.cae).toBe("11112222333344");
  });

  // #657: the detail sums to the authorized `impTotal`, which only holds if a
  // withdrawn inscription's line still prints (#600).
  test("prints one line per inscription, withdrawn ones included, at its amount", () => {
    const model = buildComprobantePrintViewModel(printRecord());

    expect(model.lines).toEqual([
      { description: "Inscripción — Ana López", amount: "$ 15.000" },
      { description: "Inscripción — Bruno Díaz", amount: "$ 10.000" },
    ]);
    expect(model.totalAmount).toBe("$ 25.000");
  });

  test("an invoice prints no associated comprobante, even when notes adjust it", () => {
    const model = buildComprobantePrintViewModel(
      printRecord({
        association: {
          role: "factura",
          adjustments: [associated({ id: "nc", cbteTipo: 13 })],
        },
      }),
    );

    expect(model.associatedComprobante).toBeNull();
  });

  test("a note prints the invoice it is associated with", () => {
    const model = buildComprobantePrintViewModel(
      printRecord({
        cbteTipo: 12,
        association: {
          role: "note",
          factura: associated({ cbteNro: 41, cbteFch: "20260715" }),
          adjustedDebitNotes: [],
        },
      }),
    );

    expect(model.associatedComprobante).toEqual({
      description: "Factura C N° 0003-00000041, del 15/07/2026",
      legend: null,
    });
  });

  // #610's leyenda: `CbtesAsoc` names only the invoice, so the debit notes
  // that billed what the credit note credits are identified here.
  test("a credit note of what debit notes billed names them in the leyenda", () => {
    const factura = associated({ cbteNro: 41 });
    const one = buildComprobantePrintViewModel(
      printRecord({
        cbteTipo: 13,
        association: {
          role: "note",
          factura,
          adjustedDebitNotes: [associated({ cbteTipo: 12, cbteNro: 5 })],
        },
      }),
    );
    const two = buildComprobantePrintViewModel(
      printRecord({
        cbteTipo: 13,
        association: {
          role: "note",
          factura,
          adjustedDebitNotes: [
            associated({ cbteTipo: 12, cbteNro: 5 }),
            associated({ cbteTipo: 12, cbteNro: 6 }),
          ],
        },
      }),
    );

    expect(one.associatedComprobante?.legend).toBe(
      "Ajusta la Nota de Débito C N° 0003-00000005, asociada a la Factura C N° 0003-00000041.",
    );
    expect(two.associatedComprobante?.legend).toBe(
      "Ajusta las Notas de Débito C N° 0003-00000005 y 0003-00000006, asociadas a la Factura C N° 0003-00000041.",
    );
  });

  test("exposes the snapshot's billed period and payment due date", () => {
    const model = buildComprobantePrintViewModel(
      printRecord({
        fchServDesde: "20260801",
        fchServHasta: "20260803",
        fchVtoPago: "20260722",
      }),
    );

    expect(model.servicePeriodFrom).toBe("01/08/2026");
    expect(model.servicePeriodTo).toBe("03/08/2026");
    expect(model.paymentDueDate).toBe("22/07/2026");
  });

  test("preserves null service dates when the snapshot does not carry them", () => {
    const model = buildComprobantePrintViewModel(printRecord());

    expect(model.servicePeriodFrom).toBeNull();
    expect(model.servicePeriodTo).toBeNull();
    expect(model.paymentDueDate).toBeNull();
  });

  test("reflects the exempt issuer (not a monotributista)", () => {
    const model = buildComprobantePrintViewModel(printRecord());

    expect(model.issuerLegalName).toBe(
      "Proyecciones Artísticas Asociación Civil",
    );
    expect(model.issuerCuit).toBe("30717611590");
    expect(model.issuerVatCondition).toBe("IVA Exento");
    expect(model.issuerVatCondition).not.toContain("Monotributo");
    expect(model.recipientVatCondition).toBe("Consumidor Final");
  });

  test("reads a seminar unit as the instructor and the date beside the academy", () => {
    const model = buildComprobantePrintViewModel(seminarPrintRecord());

    expect(model.anchorLabel).toBe("Seminario Abril Sosa, 10/10/2030");
    expect(model.academyName).toBe("Academia Alfa");
    // The seminar is taught on one day, so the period collapses to it, and what
    // is billed was already collected.
    expect(model.servicePeriodFrom).toBe("10/10/2030");
    expect(model.servicePeriodTo).toBe("10/10/2030");
    expect(model.paymentDueDate).toBe(model.issueDate);
  });

  test("uses the credit note heading for type 13", () => {
    const model = buildComprobantePrintViewModel(printRecord({ cbteTipo: 13 }));

    expect(model.header.title).toBe("Nota de Crédito C");
    expect(model.header.code).toBe("013");
  });
});

describe("renderComprobantePrintDocument", () => {
  test("renders the printed representation's HTML with numbering, legends and QR", () => {
    const html = renderComprobantePrintDocument({
      model: buildComprobantePrintViewModel(printRecord()),
      qrCodeSvg: QR_SVG_STUB,
    });

    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("0003-00000007");
    expect(html).toContain("Factura C");
    expect(html).toContain("IVA Exento");
    expect(html).toContain("Consumidor Final");
    expect(html).toContain("11112222333344");
    expect(html).toContain(QR_SVG_STUB);
    expect(html).toContain("Comprobante Autorizado");
  });

  // `Estado` is a mutable fact about an immutable document (#554): an
  // adjusted invoice reprints exactly as it was authorized.
  test("prints no status, whatever the invoice's state", () => {
    const html = renderComprobantePrintDocument({
      model: buildComprobantePrintViewModel(
        printRecord({
          association: {
            role: "factura",
            adjustments: [associated({ id: "nc", cbteTipo: 13 })],
          },
        }),
      ),
      qrCodeSvg: QR_SVG_STUB,
    });

    expect(html).not.toContain("Estado");
    expect(html).not.toContain("Ajustada");
    expect(html).not.toContain("Comprobante asociado");
  });

  test("prints a note's associated comprobante block with its leyenda", () => {
    const html = renderComprobantePrintDocument({
      model: buildComprobantePrintViewModel(
        printRecord({
          cbteTipo: 13,
          association: {
            role: "note",
            factura: associated({ cbteNro: 41 }),
            adjustedDebitNotes: [associated({ cbteTipo: 12, cbteNro: 5 })],
          },
        }),
      ),
      qrCodeSvg: QR_SVG_STUB,
    });

    expect(html).toContain("Comprobante asociado");
    expect(html).toContain("Factura C N° 0003-00000041, del 22/07/2026");
    expect(html).toContain("Ajusta la Nota de Débito C N° 0003-00000005");
  });

  test("prints the seminar's receptor block", () => {
    const html = renderComprobantePrintDocument({
      model: buildComprobantePrintViewModel(seminarPrintRecord()),
      qrCodeSvg: QR_SVG_STUB,
    });

    expect(html).toContain(
      "<p>Academia Alfa — Seminario Abril Sosa, 10/10/2030</p>",
    );
    expect(html).toContain("<td>Inscripción — Eva Ruiz</td>");
    expect(html).toContain("10/10/2030 — 10/10/2030");
  });

  test("shows the billed period and payment due date when they exist", () => {
    const html = renderComprobantePrintDocument({
      model: buildComprobantePrintViewModel(
        printRecord({
          fchServDesde: "20260801",
          fchServHasta: "20260803",
          fchVtoPago: "20260722",
        }),
      ),
      qrCodeSvg: QR_SVG_STUB,
    });

    expect(html).toContain("Período facturado:");
    expect(html).toContain("01/08/2026 — 03/08/2026");
    expect(html).toContain("Vencimiento de pago:");
  });
});
