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
    porcion: "total",
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
    expect(model.estadoLabel).toBe("Vigente");
  });

  test("proyecta una sola línea `{Porción} — {Coreografía}` con el total (ADR-0011)", () => {
    const model = buildComprobantePrintViewModel(
      printRecord({ porcion: "seña", impTotal: 25000 }),
    );

    expect(model.lines).toHaveLength(1);
    expect(model.lines[0].descripcion).toBe("Seña — Coreografía Alfa");
    expect(model.lines[0].importe).toBe(model.importeTotal);
    // La línea única no repite un renglón por bailarín ni el nombre del evento.
    expect(model.lines[0].descripcion).not.toContain("Certamen 2026");
  });

  test("expone el período facturado y el vencimiento de pago del snapshot", () => {
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

  test("preserva null en las fechas de servicio cuando el snapshot no las lleva", () => {
    const model = buildComprobantePrintViewModel(printRecord());

    expect(model.periodoDesde).toBeNull();
    expect(model.periodoHasta).toBeNull();
    expect(model.vencimientoPago).toBeNull();
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

  test("muestra el período facturado y el vencimiento de pago cuando existen", () => {
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

  test("coincide con el snapshot del impreso", () => {
    const html = renderComprobantePrintDocument({
      model: buildComprobantePrintViewModel(printRecord()),
      qrCodeSvg: QR_SVG_STUB,
    });

    expect(html).toMatchSnapshot();
  });
});
