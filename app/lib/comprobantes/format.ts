import {
  FACTURA_C_CBTE_TIPO,
  NOTA_CREDITO_C_CBTE_TIPO,
} from "@/lib/comprobantes/arca/factura-c";

import type { ComprobanteStatus } from "./comprobante-status.server";

// Fiscal numbering format `PPPP-NNNNNNNN`: a 4-digit sales point and an 8-digit
// sequence number, zero-padded (numbering from #334).
export function formatComprobanteNumber(comprobante: {
  ptoVta: number;
  cbteNro: number;
}): string {
  const ptoVta = String(comprobante.ptoVta).padStart(4, "0");
  const cbteNro = String(comprobante.cbteNro).padStart(8, "0");
  return `${ptoVta}-${cbteNro}`;
}

// Readable label for the ARCA comprobante type. Only Factura C (type 11) and
// Nota de crédito C (type 13) are emitted; any other value falls back to the raw
// code, so as not to hide unexpected data.
export function formatComprobanteTipoLabel(cbteTipo: number): string {
  if (cbteTipo === FACTURA_C_CBTE_TIPO) {
    return "Factura C";
  }

  if (cbteTipo === NOTA_CREDITO_C_CBTE_TIPO) {
    return "Nota de crédito C";
  }

  return `Comprobante ${cbteTipo}`;
}

// Initials of the comprobante type for the list's Tipo column: `FC` (Factura C)
// or `NC` (Nota de crédito C). The full label stays as the `title`, so the data
// is not lost when the badge is shrunk.
export function formatComprobanteTipoInitials(cbteTipo: number): string {
  if (cbteTipo === FACTURA_C_CBTE_TIPO) {
    return "FC";
  }

  if (cbteTipo === NOTA_CREDITO_C_CBTE_TIPO) {
    return "NC";
  }

  return `C${cbteTipo}`;
}

// The type badge's variant (the list's Tipo column and the detail): Factura C is
// `info` (blue) and Nota de crédito C is `warning` (yellow), to tell the original
// comprobante from its annulment at a glance. The literal matches the Badge
// component's variants without coupling the lib to the UI layer.
export function comprobanteTipoBadgeVariant(
  cbteTipo: number,
): "info" | "warning" | "outline" {
  if (cbteTipo === FACTURA_C_CBTE_TIPO) {
    return "info";
  }

  if (cbteTipo === NOTA_CREDITO_C_CBTE_TIPO) {
    return "warning";
  }

  return "outline";
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

// Converts an ARCA date `AAAAMMDD` (`CbteFch`/`CAEFchVto`) to `DD/MM/AAAA`. If
// the value does not have that shape it is returned as is: the row is an
// immutable snapshot and hiding data that does not match expectations is never
// worth it.
export function formatComprobanteArcaDate(value: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);

  if (!match) {
    return value;
  }

  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}
