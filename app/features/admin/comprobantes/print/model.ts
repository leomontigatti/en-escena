import { formatAmount } from "@/lib/finances/formatters";
import { buildComprobanteQrUrl } from "@/lib/comprobantes/arca/qr";
import {
  formatComprobanteAnchorLabel,
  type ComprobanteAnchorReading,
} from "@/lib/comprobantes/anchor-reading";
import type {
  AssociatedComprobante,
  ComprobanteAssociation,
} from "@/lib/comprobantes/association";
import type { ComprobanteLineDetail } from "@/lib/comprobantes/comprobante-record.server";
import type { comprobantes } from "@/db/schema";
import {
  formatComprobanteArcaDate,
  formatComprobanteNumber,
} from "@/lib/comprobantes/format";
import {
  comprobantePrintHeader,
  type ComprobantePrintHeader,
} from "@/lib/comprobantes/kind";
import {
  COMPROBANTE_AUTHORIZED_LABEL,
  ISSUER_VAT_CONDITION_LABEL,
  ISSUER_LEGAL_NAME,
  RECIPIENT_VAT_CONDITION_LABEL,
} from "@/lib/comprobantes/printout";

// The anchor/academy/event context anchoring the comprobante in the printout.
// The anchor travels as its reading and not as a choreography name, because the
// receptor block names one of two units.
export type ComprobantePrintContext = {
  anchor: ComprobanteAnchorReading;
  academyName: string;
  eventName: string;
};

// The comprobante's already loaded snapshot with its lines, its association
// and the anchoring context. It is the input to the printable view's model.
export type ComprobantePrintRecord = typeof comprobantes.$inferSelect &
  ComprobantePrintContext & {
    lines: ComprobanteLineDetail[];
    association: ComprobanteAssociation | null;
  };

// Detail line of the printed document: one per billed inscription,
// `Inscripción — {bailarín}` at the net amount billed for it, so the lines sum
// to the authorized total (#657). There is no quantity column, and the
// discount is never a line of its own. A withdrawn inscription prints like any
// other: what was billed for it is part of the total (#600).
export type ComprobantePrintLine = {
  description: string;
  amount: string;
};

// The `Comprobante asociado` block of a note: the invoice its `CbtesAsoc`
// carries and, when it credits what debit notes billed, #610's leyenda naming
// them. The leyenda never reaches ARCA (`FECAESolicitar` has no free-text
// field), so the printed document is where it lives.
export type ComprobantePrintAssociation = {
  description: string;
  legend: string | null;
};

// The printable view's model, with every text already formatted. It is the
// contract the HTML document consumes and the one the test's snapshot validates.
export type ComprobantePrintViewModel = {
  header: ComprobantePrintHeader;
  number: string;
  issueDate: string;
  issuerLegalName: string;
  issuerCuit: string;
  issuerVatCondition: string;
  recipientVatCondition: string;
  academyName: string;
  // The unit the receptor block names beside the academy: the choreography's
  // name, or `Seminario {instructor}, {fecha}`.
  anchorLabel: string;
  eventName: string;
  lines: ComprobantePrintLine[];
  totalAmount: string;
  // The billed service period and payment due date (Concepto 2, RG 1415),
  // already formatted to `DD/MM/AAAA`. `null` when the snapshot does not carry
  // them (the pre-existing row emitted as Concepto 1 never carried service dates).
  servicePeriodFrom: string | null;
  servicePeriodTo: string | null;
  paymentDueDate: string | null;
  // `null` on an invoice: the notes that adjust it are not printed on it.
  associatedComprobante: ComprobantePrintAssociation | null;
  cae: string;
  caeVto: string;
  authorizedLabel: string;
  qrUrl: string;
};

// Builds the printable view's model from the comprobante's immutable snapshot.
// It is a pure read-only projection: it does NOT call ARCA and mutates nothing.
// The legends reflect the exempt issuer (printout.ts). It prints no status:
// `Estado` changes as notes adjust an invoice, and the document does not.
export function buildComprobantePrintViewModel(
  record: ComprobantePrintRecord,
): ComprobantePrintViewModel {
  return {
    header: comprobantePrintHeader(record.cbteTipo),
    number: formatComprobanteNumber(record),
    issueDate: formatComprobanteArcaDate(record.cbteFch),
    issuerLegalName: ISSUER_LEGAL_NAME,
    issuerCuit: record.issuerCuit,
    issuerVatCondition: ISSUER_VAT_CONDITION_LABEL,
    recipientVatCondition: RECIPIENT_VAT_CONDITION_LABEL,
    academyName: record.academyName,
    anchorLabel: formatComprobanteAnchorLabel(record.anchor),
    eventName: record.eventName,
    lines: record.lines.map((line) => ({
      description: line.description,
      amount: formatAmount(line.amount),
    })),
    totalAmount: formatAmount(record.impTotal),
    servicePeriodFrom: formatArcaDateOrNull(record.fchServDesde),
    servicePeriodTo: formatArcaDateOrNull(record.fchServHasta),
    paymentDueDate: formatArcaDateOrNull(record.fchVtoPago),
    associatedComprobante:
      record.association?.role === "note"
        ? {
            description: `${describeComprobante(record.association.factura)}, del ${formatComprobanteArcaDate(record.association.factura.cbteFch)}`,
            legend: adjustmentLegend(record.association),
          }
        : null,
    cae: record.cae,
    caeVto: formatComprobanteArcaDate(record.caeVto),
    authorizedLabel: COMPROBANTE_AUTHORIZED_LABEL,
    qrUrl: buildComprobanteQrUrl(record),
  };
}

// Formats a nullable ARCA date `AAAAMMDD` to `DD/MM/AAAA`, preserving the `null`
// when the snapshot does not carry it.
function formatArcaDateOrNull(value: string | null): string | null {
  return value === null ? null : formatComprobanteArcaDate(value);
}

function describeComprobante(comprobante: AssociatedComprobante): string {
  return `${comprobantePrintHeader(comprobante.cbteTipo).title} N° ${formatComprobanteNumber(comprobante)}`;
}

// "Ajusta la Nota de Débito C N° … , asociada a la Factura C N° …", in the
// plural when the credit note covers what several debit notes billed. Every
// debit note is class C and anchored at the same invoice, so the title is said
// once.
function adjustmentLegend(
  association: Extract<ComprobanteAssociation, { role: "note" }>,
): string | null {
  const notes = association.adjustedDebitNotes;

  if (notes.length === 0) {
    return null;
  }

  const numbers = notes.map((note) => formatComprobanteNumber(note));
  const factura = describeComprobante(association.factura);

  if (numbers.length === 1) {
    return `Ajusta la Nota de Débito C N° ${numbers[0]}, asociada a la ${factura}.`;
  }

  const listed = `${numbers.slice(0, -1).join(", ")} y ${numbers.at(-1)}`;

  return `Ajusta las Notas de Débito C N° ${listed}, asociadas a la ${factura}.`;
}
