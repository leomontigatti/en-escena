import type { KnownComprobanteKind } from "@/lib/comprobantes/kind";

import type { AnchorInvoicing } from "./shared";

/**
 * What a financial detail's `Emitir` item reads when the unit owes `kind` for
 * `amount`, dated today, 2026-07-22, with the series' floor ten days back.
 */
export function readyInvoicing(
  kind: KnownComprobanteKind,
  amount: number,
): Extract<AnchorInvoicing, { status: "ready" }> {
  return {
    status: "ready",
    kind,
    amount,
    cbteFch: {
      today: "2026-07-22",
      floor: "2026-07-12",
      max: "2026-07-22",
      floorDescription:
        "12/07/2026: ARCA no acepta comprobantes de servicios fechados más de 10 días antes de hoy (Factura C, punto de venta 0001)",
    },
  };
}
