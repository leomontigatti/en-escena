import type { ComprobanteStatus } from "@/lib/comprobantes/comprobante-status.server";

/**
 * The `estado` filter's values as the URL carries them. The status is English
 * inside the code and Spanish in the address bar, so both directions read this
 * one map.
 */
export const comprobanteStatusSearchValues: Record<ComprobanteStatus, string> =
  {
    valid: "vigente",
    annulled: "anulada",
  };

export function readComprobanteStatusSearchValue(
  value: string | null,
): ComprobanteStatus | null {
  switch (value) {
    case comprobanteStatusSearchValues.valid:
      return "valid";
    case comprobanteStatusSearchValues.annulled:
      return "annulled";
    default:
      return null;
  }
}
