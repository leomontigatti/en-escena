import { readComprobanteKind } from "./kind";

// The associated comprobante, read in both directions (#657, #610). Every note
// anchors at its unit's invoice (the star, ADR-0014 §5), so a note names that
// invoice and an invoice lists the notes that adjust it; nothing anchors at a
// note.
//
// A credit note also says which debit notes it adjusts, for the leyenda its
// printed document carries (#610): `CbtesAsoc` names only the invoice, so when
// what the note credits was billed by a debit note, the leyenda is where that
// debit note is identified. It is derived from the lines, not stored: a debit
// note is adjusted when it billed, before the credit note, a positive amount
// for an inscription the credit note credits.

/** The fields a surface needs to name an associated comprobante. */
export type AssociatedComprobante = {
  id: string;
  cbteTipo: number;
  ptoVta: number;
  cbteNro: number;
  cbteFch: string;
  impTotal: number;
};

export type AssociationScopeComprobante = AssociatedComprobante & {
  associatedComprobanteId: string | null;
  lines: ReadonlyArray<{
    choreographyInscriptionId: string | null;
    seminarInscriptionId: string | null;
    amount: number;
  }>;
};

export type ComprobanteAssociation =
  | { role: "factura"; adjustments: AssociatedComprobante[] }
  | {
      role: "note";
      factura: AssociatedComprobante;
      adjustedDebitNotes: AssociatedComprobante[];
    };

/**
 * `scope` is every comprobante of the anchor, in emission order: that order is
 * what tells a debit note the credit note can adjust from one emitted after it.
 * `null` for a comprobante of an unknown kind, and for a note whose invoice is
 * not in the scope, which the star rules out.
 */
export function readComprobanteAssociation(
  comprobante: AssociationScopeComprobante,
  scope: readonly AssociationScopeComprobante[],
): ComprobanteAssociation | null {
  const { kind } = readComprobanteKind(comprobante.cbteTipo);

  if (kind === "factura_c") {
    return {
      role: "factura",
      adjustments: scope
        .filter(
          (candidate) => candidate.associatedComprobanteId === comprobante.id,
        )
        .map(toAssociated),
    };
  }

  if (kind === "unknown") {
    return null;
  }

  const factura = scope.find(
    (candidate) => candidate.id === comprobante.associatedComprobanteId,
  );

  if (!factura) {
    return null;
  }

  return {
    role: "note",
    factura: toAssociated(factura),
    adjustedDebitNotes:
      kind === "nota_credito_c"
        ? findAdjustedDebitNotes(comprobante, scope).map(toAssociated)
        : [],
  };
}

function findAdjustedDebitNotes(
  creditNote: AssociationScopeComprobante,
  scope: readonly AssociationScopeComprobante[],
): AssociationScopeComprobante[] {
  const credited = new Set(creditNote.lines.map(lineInscriptionId));
  const emittedBefore = scope.slice(
    0,
    Math.max(
      0,
      scope.findIndex((candidate) => candidate.id === creditNote.id),
    ),
  );

  return emittedBefore.filter(
    (candidate) =>
      candidate.associatedComprobanteId ===
        creditNote.associatedComprobanteId &&
      readComprobanteKind(candidate.cbteTipo).kind === "nota_debito_c" &&
      candidate.lines.some(
        (line) => line.amount > 0 && credited.has(lineInscriptionId(line)),
      ),
  );
}

function lineInscriptionId(
  line: AssociationScopeComprobante["lines"][number],
): string | null {
  return line.choreographyInscriptionId ?? line.seminarInscriptionId;
}

function toAssociated(
  comprobante: AssociationScopeComprobante,
): AssociatedComprobante {
  return {
    id: comprobante.id,
    cbteTipo: comprobante.cbteTipo,
    ptoVta: comprobante.ptoVta,
    cbteNro: comprobante.cbteNro,
    cbteFch: comprobante.cbteFch,
    impTotal: comprobante.impTotal,
  };
}
