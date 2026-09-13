/** @vitest-environment jsdom */

import { describe, expect, test } from "vitest";

import {
  buildComprobantePrintViewModel,
  type ComprobantePrintRecord,
} from "./model";
import { renderComprobantePrintDocument } from "./view";

// A stable QR snapshot: the printout injects the SVG as is, so the HTML snapshot
// is not tied to the QR's matrix (validated separately in arca/qr.test).
const QR_SVG_STUB = '<svg data-testid="qr-stub"></svg>';

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
    status: "vigente",
    lines: [
      {
        id: "line_1",
        comprobanteId: "comprobante_1",
        choreographyInscriptionId: "insc_1",
        seminarInscriptionId: null,
        amount: 15000,
      },
      {
        id: "line_2",
        comprobanteId: "comprobante_1",
        choreographyInscriptionId: "insc_2",
        seminarInscriptionId: null,
        amount: 10000,
      },
    ],
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
        comprobanteId: "comprobante_1",
        choreographyInscriptionId: null,
        seminarInscriptionId: "seminar_insc_1",
        amount: 25000,
      },
    ],
    ...overrides,
  });
}

describe("buildComprobantePrintViewModel", () => {
  test("projects the comprobante snapshot with #334's numbering and legends", () => {
    const model = buildComprobantePrintViewModel(printRecord());

    expect(model.numero).toBe("0003-00000007");
    expect(model.header.titulo).toBe("Factura C");
    expect(model.header.letra).toBe("C");
    expect(model.header.codigo).toBe("011");
    expect(model.fechaEmision).toBe("22/07/2026");
    expect(model.caeVto).toBe("01/08/2026");
    expect(model.cae).toBe("11112222333344");
    expect(model.estadoLabel).toBe("Vigente");
  });

  test("projects a single `Inscripción` line with the total", () => {
    const model = buildComprobantePrintViewModel(
      printRecord({ impTotal: 25000 }),
    );

    expect(model.lines).toHaveLength(1);
    // The description names the service sold, not a rung of the retired ladder:
    // `porcion` is deleted, so a comprobante is neither deposit nor balance.
    expect(model.lines[0].descripcion).toBe("Inscripción");
    expect(model.lines[0].importe).toBe(model.importeTotal);
    // It carries no right-hand side: the receptor block already names the
    // academy and the choreography, and there is no dancer to name until #657
    // renders one line per inscription.
    expect(model.lines[0].descripcion).not.toContain("Coreografía Alfa");
    expect(model.lines[0].descripcion).not.toContain("Certamen 2026");
  });

  test("exposes the snapshot's billed period and payment due date", () => {
    const model = buildComprobantePrintViewModel(
      printRecord({
        fchServDesde: "20260801",
        fchServHasta: "20260803",
        fchVtoPago: "20260722",
      }),
    );

    expect(model.periodoDesde).toBe("01/08/2026");
    expect(model.periodoHasta).toBe("03/08/2026");
    expect(model.vencimientoPago).toBe("22/07/2026");
  });

  test("preserves null service dates when the snapshot does not carry them", () => {
    const model = buildComprobantePrintViewModel(printRecord());

    expect(model.periodoDesde).toBeNull();
    expect(model.periodoHasta).toBeNull();
    expect(model.vencimientoPago).toBeNull();
  });

  test("reflects the exempt issuer (not a monotributista)", () => {
    const model = buildComprobantePrintViewModel(printRecord());

    expect(model.emisorRazonSocial).toBe(
      "Proyecciones Artísticas Asociación Civil",
    );
    expect(model.emisorCuit).toBe("30717611590");
    expect(model.emisorCondicionIva).toBe("IVA Exento");
    expect(model.emisorCondicionIva).not.toContain("Monotributo");
    expect(model.receptorCondicionIva).toBe("Consumidor Final");
  });

  test("reads a seminar unit as the instructor and the date beside the academy", () => {
    const model = buildComprobantePrintViewModel(seminarPrintRecord());

    expect(model.anchorLabel).toBe("Seminario Abril Sosa, 10/10/2030");
    expect(model.academyName).toBe("Academia Alfa");
    // The single line is the same constant on both kinds.
    expect(model.lines).toHaveLength(1);
    expect(model.lines[0].descripcion).toBe("Inscripción");
    // The seminar is taught on one day, so the period collapses to it, and what
    // is billed was already collected.
    expect(model.periodoDesde).toBe("10/10/2030");
    expect(model.periodoHasta).toBe("10/10/2030");
    expect(model.vencimientoPago).toBe(model.fechaEmision);
  });

  test("uses the credit note heading for type 13", () => {
    const model = buildComprobantePrintViewModel(
      printRecord({ cbteTipo: 13, status: "anulada" }),
    );

    expect(model.header.titulo).toBe("Nota de Crédito C");
    expect(model.header.codigo).toBe("013");
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

  test("prints `Inscripción` alone under `Descripción` and leaves the context under `Receptor`", () => {
    const html = renderComprobantePrintDocument({
      model: buildComprobantePrintViewModel(printRecord()),
      qrCodeSvg: QR_SVG_STUB,
    });

    // The detail cell is the description column RG 1415 asks to identify the
    // service; the receptor block above is where the academy and choreography
    // are already named, which is why the cell does not repeat them.
    expect(html).toContain("<td>Inscripción</td>");
    expect(html).toContain("<p>Academia Alfa — Coreografía Alfa</p>");
  });

  test("prints the seminar's receptor block and keeps the constant line", () => {
    const html = renderComprobantePrintDocument({
      model: buildComprobantePrintViewModel(seminarPrintRecord()),
      qrCodeSvg: QR_SVG_STUB,
    });

    expect(html).toContain(
      "<p>Academia Alfa — Seminario Abril Sosa, 10/10/2030</p>",
    );
    expect(html).toContain("<td>Inscripción</td>");
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

  test("matches the printed representation snapshot", () => {
    const html = renderComprobantePrintDocument({
      model: buildComprobantePrintViewModel(printRecord()),
      qrCodeSvg: QR_SVG_STUB,
    });

    expect(html).toMatchSnapshot();
  });
});
