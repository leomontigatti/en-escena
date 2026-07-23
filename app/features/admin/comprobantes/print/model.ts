import { formatAmount } from "@/features/admin/academies/account-current/formatters";
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

// Fila de detalle del impreso: una por línea interna del comprobante (#326).
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
    lines: record.lines.map((line) => ({
      descripcion: `Inscripción — ${record.choreographyName}`,
      importe: formatAmount(line.amount),
    })),
    importeTotal: formatAmount(record.impTotal),
    cae: record.cae,
    caeVto: formatComprobanteArcaDate(record.caeVto),
    estado: record.status,
    estadoLabel: formatComprobanteStatusLabel(record.status),
    comprobanteAutorizadoLabel: COMPROBANTE_AUTORIZADO_LABEL,
    qrUrl: buildComprobanteQrUrl(record),
  };
}
