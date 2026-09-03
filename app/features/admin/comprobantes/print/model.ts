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

// The choreography/academy/event context anchoring the comprobante in the
// printout.
export type ComprobantePrintContext = {
  choreographyName: string;
  academyName: string;
  eventName: string;
};

// The comprobante's already loaded snapshot with its derived state, its lines
// and the anchoring context. It is the input to the printable view's model.
export type ComprobantePrintRecord = ComprobanteWithLines &
  ComprobantePrintContext;

// Detail line of the printed document. It carries ONE line per comprobante — no
// quantity column and no row per dancer — so the academy gets a readable
// document. Its description names the service sold and nothing else; what the
// service was sold for is already in the receptor block. See
// `buildComprobantePrintViewModel`.
export type ComprobantePrintLine = {
  descripcion: string;
  importe: string;
};

// The printable view's model, with every text already formatted. It is the
// contract the HTML document consumes and the one the test's snapshot validates.
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
  // The billed service period and payment due date (Concepto 2, RG 1415),
  // already formatted to `DD/MM/AAAA`. `null` when the snapshot does not carry
  // them (the pre-existing row emitted as Concepto 1 never carried service dates).
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
 * The whole description of the single printed line, replacing the `porción`
 * label the line used to open with. It names **what was sold** rather than which
 * rung of a ladder the money paid, which is the whole reason `porción` had to
 * go: a comprobante now covers an arbitrary amount and can be honestly labelled
 * as neither deposit nor saldo. It is what RG 1415 asks that column for — a
 * description identifying the service.
 *
 * It carries no right-hand side, per #554 decision 3 and the owner's ruling on
 * the #723 review. The choreography name was tried there and declined for the
 * reason the decision gives: the receptor block a few lines above already prints
 * `{academia} — {coreografía}` (`view.tsx`), so repeating it under `Descripción`
 * describes no additional service. The noun is singular because it names the
 * concept, not a count of dancers, so it reads correctly for a solo and for a
 * group.
 *
 * It is also the noun ADR-0014 §5 gives the settled per-dancer line,
 * `Inscripción — {bailarín}`. That line is #657's, and needs one line per
 * inscription to have a dancer to name; until then the description stops at the
 * concept, so #657 appends its right-hand side and nothing else churns.
 */
const PRINT_LINE_DESCRIPTION = "Inscripción";

// Builds the printable view's model from the comprobante's immutable snapshot.
// It is a pure read-only projection: it does NOT call ARCA and mutates nothing.
// The legends reflect the exempt issuer (impreso.ts).
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
        descripcion: PRINT_LINE_DESCRIPTION,
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

// Formats a nullable ARCA date `AAAAMMDD` to `DD/MM/AAAA`, preserving the `null`
// when the snapshot does not carry it.
function formatArcaDateOrNull(value: string | null): string | null {
  return value === null ? null : formatComprobanteArcaDate(value);
}
