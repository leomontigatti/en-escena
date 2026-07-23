/** @vitest-environment jsdom */

import { describe, expect, test } from "vitest";

import {
  buildComprobantePrintViewModel,
  type ComprobantePrintRecord,
} from "./model";
import { renderComprobantePrintDocument } from "./view";

// Snapshot de QR estable: el impreso inyecta el SVG tal cual, así el snapshot del
// HTML no queda atado a la matriz del QR (validada aparte en arca/qr.test).
const QR_SVG_STUB = '<svg data-testid="qr-stub"></svg>';

function printRecord(
  overrides: Partial<ComprobantePrintRecord> = {},
): ComprobantePrintRecord {
  return {
    id: "comprobante_1",
    choreographyId: "choreo_1",
    eventId: "event_1",
    cbteTipo: 11,
    ptoVta: 3,
    cbteNro: 7,
    cbteFch: "20260722",
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
        inscriptionId: "insc_1",
        amount: 15000,
      },
      {
        id: "line_2",
        comprobanteId: "comprobante_1",
        inscriptionId: "insc_2",
        amount: 10000,
      },
    ],
    choreographyName: "Coreografía Alfa",
    academyName: "Academia Alfa",
    eventName: "Certamen 2026",
    ...overrides,
  };
}

describe("buildComprobantePrintViewModel", () => {
  test("proyecta el snapshot del comprobante con numeración y leyendas de #334", () => {
    const model = buildComprobantePrintViewModel(printRecord());

    expect(model.numero).toBe("0003-00000007");
    expect(model.header.titulo).toBe("Factura C");
    expect(model.header.letra).toBe("C");
    expect(model.header.codigo).toBe("011");
    expect(model.fechaEmision).toBe("22/07/2026");
    expect(model.caeVto).toBe("01/08/2026");
    expect(model.cae).toBe("11112222333344");
    expect(model.lines).toHaveLength(2);
    expect(model.estadoLabel).toBe("Vigente");
  });

  test("refleja al emisor exento (no monotributista)", () => {
    const model = buildComprobantePrintViewModel(printRecord());

    expect(model.emisorRazonSocial).toBe(
      "Proyecciones Artísticas Asociación Civil",
    );
    expect(model.emisorCuit).toBe("30717611590");
    expect(model.emisorCondicionIva).toBe("IVA Exento");
    expect(model.emisorCondicionIva).not.toContain("Monotributo");
    expect(model.receptorCondicionIva).toBe("Consumidor Final");
  });

  test("usa el encabezado de nota de crédito para el tipo 13", () => {
    const model = buildComprobantePrintViewModel(
      printRecord({ cbteTipo: 13, status: "anulada" }),
    );

    expect(model.header.titulo).toBe("Nota de Crédito C");
    expect(model.header.codigo).toBe("013");
  });
});

describe("renderComprobantePrintDocument", () => {
  test("renderiza el HTML del impreso con numeración, leyendas y QR", () => {
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

  test("coincide con el snapshot del impreso", () => {
    const html = renderComprobantePrintDocument({
      model: buildComprobantePrintViewModel(printRecord()),
      qrCodeSvg: QR_SVG_STUB,
    });

    expect(html).toMatchSnapshot();
  });
});
