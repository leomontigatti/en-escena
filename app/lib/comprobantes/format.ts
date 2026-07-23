import {
  FACTURA_C_CBTE_TIPO,
  NOTA_CREDITO_C_CBTE_TIPO,
} from "@/lib/comprobantes/arca/factura-c";

import type { ComprobanteStatus } from "./comprobante-status.server";
import type { ComprobantePorcion } from "./emit-factura-c.server";

// Formato de numeración fiscal `PPPP-NNNNNNNN`: punto de venta a 4 dígitos y
// correlativo a 8, con ceros a la izquierda (numeración de #334).
export function formatComprobanteNumber(comprobante: {
  ptoVta: number;
  cbteNro: number;
}): string {
  const ptoVta = String(comprobante.ptoVta).padStart(4, "0");
  const cbteNro = String(comprobante.cbteNro).padStart(8, "0");
  return `${ptoVta}-${cbteNro}`;
}

// Etiqueta legible del tipo de comprobante ARCA. Sólo se emiten Factura C
// (tipo 11) y Nota de crédito C (tipo 13); cualquier otro valor cae al código
// crudo para no ocultar datos inesperados.
export function formatComprobanteTipoLabel(cbteTipo: number): string {
  if (cbteTipo === FACTURA_C_CBTE_TIPO) {
    return "Factura C";
  }

  if (cbteTipo === NOTA_CREDITO_C_CBTE_TIPO) {
    return "Nota de crédito C";
  }

  return `Comprobante ${cbteTipo}`;
}

// Iniciales del tipo de comprobante para la columna Tipo de la lista: `FC`
// (Factura C) o `NC` (Nota de crédito C). El label completo queda como `title`
// para no perder el dato al reducir el badge.
export function formatComprobanteTipoInitials(cbteTipo: number): string {
  if (cbteTipo === FACTURA_C_CBTE_TIPO) {
    return "FC";
  }

  if (cbteTipo === NOTA_CREDITO_C_CBTE_TIPO) {
    return "NC";
  }

  return `C${cbteTipo}`;
}

const comprobanteStatusLabels: Record<ComprobanteStatus, string> = {
  vigente: "Vigente",
  anulada: "Anulada",
};

export function formatComprobanteStatusLabel(
  status: ComprobanteStatus,
): string {
  return comprobanteStatusLabels[status];
}

const comprobantePorcionLabels: Record<ComprobantePorcion, string> = {
  seña: "Seña",
  saldo: "Saldo",
  total: "Total",
};

// Etiqueta legible de la porción congelada del comprobante (ADR-0011). Es la
// misma superficie en el impreso, el preview de emisión y el detalle.
export function formatComprobantePorcionLabel(
  porcion: ComprobantePorcion,
): string {
  return comprobantePorcionLabels[porcion];
}

// Convierte una fecha ARCA `AAAAMMDD` (`CbteFch`/`CAEFchVto`) a `DD/MM/AAAA`.
// Si el valor no tiene esa forma se devuelve tal cual: la fila es un snapshot
// inmutable y nunca conviene esconder un dato que no matchea lo esperado.
export function formatComprobanteArcaDate(value: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);

  if (!match) {
    return value;
  }

  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}
