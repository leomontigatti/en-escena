import { formatAmount } from "@/features/admin/finances/formatters";
import { buildComprobanteQrUrl } from "@/lib/comprobantes/arca/qr";
import type { ComprobanteStatus } from "@/lib/comprobantes/comprobante-status.server";
import type { ComprobanteWithLines } from "@/lib/comprobantes/comprobantes.server";
import {
  formatComprobanteArcaDate,
  formatComprobanteNumber,
  formatComprobanteStatusLabel,
} from "@/lib/comprobantes/format";
import {
  COMPROBANTE_AUTORIZADO_LABEL,
  comprobanteImpresoHeader,
  EMISOR_CONDICION_IVA_LABEL,
  EMISOR_RAZON_SOCIAL,
  RECEPTOR_CONDICION_IVA_LABEL,
  type ComprobanteImpresoHeader,
} from "@/lib/comprobantes/impreso";

// Contexto de coreografía/academia/evento que ancla el comprobante en el impreso.
export type ComprobantePrintContext = {
  choreographyName: string;
  academyName: string;
  eventName: string;
};

// Snapshot ya cargado del comprobante con su estado derivado, sus líneas y el
// contexto que ancla. Es el insumo del modelo de la vista imprimible.
export type ComprobantePrintRecord = ComprobanteWithLines &
  ComprobantePrintContext;

// Detail line of the printed document. It carries ONE line per comprobante — no
// quantity column and no row per dancer — so the academy gets a readable
// document. Its description names the service sold; the choreography it was
// sold for is the right-hand side. See `buildComprobantePrintViewModel`.
export type ComprobantePrintLine = {
  descripcion: string;
  importe: string;
};

// Modelo de la vista imprimible, con todos los textos ya formateados. Es el
// contrato que consume el documento HTML y el que valida el snapshot del test.
export type ComprobantePrintViewModel = {
  header: ComprobanteImpresoHeader;
  numero: string;
  fechaEmision: string;
  emisorRazonSocial: string;
  emisorCuit: string;
  emisorCondicionIva: string;
  receptorCondicionIva: string;
  academyName: string;
  choreographyName: string;
  eventName: string;
  lines: ComprobantePrintLine[];
  importeTotal: string;
  // Período de servicio facturado y vencimiento de pago (Concepto 2, RG 1415)
  // ya formateados a `DD/MM/AAAA`. `null` cuando el snapshot no los lleva (la
  // fila preexistente emitida como Concepto 1 nunca cargó fechas de servicio).
  periodoDesde: string | null;
  periodoHasta: string | null;
  vencimientoPago: string | null;
  cae: string;
  caeVto: string;
  estado: ComprobanteStatus;
  estadoLabel: string;
  comprobanteAutorizadoLabel: string;
  qrUrl: string;
};

/**
 * Left-hand side of the single printed line, replacing the `porción` label the
 * line used to open with. It names **what was sold** rather than which rung of a
 * ladder the money paid, which is the whole reason `porción` had to go: a
 * comprobante now covers an arbitrary amount and can be honestly labelled as
 * neither seña nor saldo.
 *
 * The choreography name alone was the cheaper option and was declined: the
 * receptor block two lines above already prints `{academia} — {coreografía}`, so
 * a bare proper noun under `Descripción` would repeat it and describe no
 * service, which is what RG 1415 asks that column for. It is singular because it
 * names the concept, not a count of dancers, so it reads correctly for a solo
 * and for a group; it is also the noun ADR-0014 §5 gives the settled per-dancer
 * line (`Inscripción — {bailarín}`), so only the right-hand side moves when #657
 * lands.
 */
const PRINT_LINE_CONCEPT = "Inscripción";

// Arma el modelo de la vista imprimible desde el snapshot inmutable del
// comprobante. Es una proyección pura de sólo lectura: NO llama a ARCA ni muta
// nada. Las leyendas reflejan al emisor exento (impreso.ts).
export function buildComprobantePrintViewModel(
  record: ComprobantePrintRecord,
): ComprobantePrintViewModel {
  return {
    header: comprobanteImpresoHeader(record.cbteTipo),
    numero: formatComprobanteNumber(record),
    fechaEmision: formatComprobanteArcaDate(record.cbteFch),
    emisorRazonSocial: EMISOR_RAZON_SOCIAL,
    emisorCuit: record.issuerCuit,
    emisorCondicionIva: EMISOR_CONDICION_IVA_LABEL,
    receptorCondicionIva: RECEPTOR_CONDICION_IVA_LABEL,
    academyName: record.academyName,
    choreographyName: record.choreographyName,
    eventName: record.eventName,
    lines: [
      {
        descripcion: `${PRINT_LINE_CONCEPT} — ${record.choreographyName}`,
        importe: formatAmount(record.impTotal),
      },
    ],
    importeTotal: formatAmount(record.impTotal),
    periodoDesde: formatArcaDateOrNull(record.fchServDesde),
    periodoHasta: formatArcaDateOrNull(record.fchServHasta),
    vencimientoPago: formatArcaDateOrNull(record.fchVtoPago),
    cae: record.cae,
    caeVto: formatComprobanteArcaDate(record.caeVto),
    estado: record.status,
    estadoLabel: formatComprobanteStatusLabel(record.status),
    comprobanteAutorizadoLabel: COMPROBANTE_AUTORIZADO_LABEL,
    qrUrl: buildComprobanteQrUrl(record),
  };
}

// Formatea una fecha ARCA `AAAAMMDD` nullable a `DD/MM/AAAA`, preservando el
// `null` cuando el snapshot no la lleva.
function formatArcaDateOrNull(value: string | null): string | null {
  return value === null ? null : formatComprobanteArcaDate(value);
}
