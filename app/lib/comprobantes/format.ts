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

const comprobanteStatusLabels: Record<ComprobanteStatus, string> = {
  valid: "Vigente",
  adjusted: "Ajustada",
  annulled: "Anulada",
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
