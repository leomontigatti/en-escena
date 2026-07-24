import { formatAmount } from "@/features/admin/academies/account-current/formatters";
import { buildComprobanteQrUrl } from "@/lib/comprobantes/arca/qr";
import type { ComprobanteStatus } from "@/lib/comprobantes/comprobante-status.server";
import type { ComprobanteWithLines } from "@/lib/comprobantes/comprobantes.server";
import {
  formatComprobanteArcaDate,
  formatComprobanteNumber,
  formatComprobantePorcionLabel,
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

// Línea de detalle del impreso. Desde ADR-0011 el impreso lleva UNA sola línea
// por comprobante —`{Porción} — {Coreografía}`, sin cantidad ni renglón por
// bailarín— para entregar a la academia un documento legible.
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
        descripcion: `${formatComprobantePorcionLabel(record.porcion)} — ${record.choreographyName}`,
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
