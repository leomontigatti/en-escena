import type { ComprobanteAnchor } from "@/lib/comprobantes/anchor";
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

/**
 * The `origen` filter's values: which kind of anchor a comprobante belongs to,
 * the anchor's own `kind` inside the code and Spanish in the address bar, read
 * through this map like the status.
 */
export const comprobanteAnchorKindSearchValues: Record<
  ComprobanteAnchor["kind"],
  string
> = {
  choreography: "coreografia",
  seminar: "seminario",
};

export function readComprobanteAnchorKindSearchValue(
  value: string | null,
): ComprobanteAnchor["kind"] | null {
  switch (value) {
    case comprobanteAnchorKindSearchValues.choreography:
      return "choreography";
    case comprobanteAnchorKindSearchValues.seminar:
      return "seminar";
    default:
      return null;
  }
}
