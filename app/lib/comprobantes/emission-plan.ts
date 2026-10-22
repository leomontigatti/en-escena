import {
  deriveRetainedAmount,
  type InscriptionFinancialStatus,
} from "@/lib/finances/inscription-financial-status";

import {
  comprobanteKindSign,
  readComprobanteKind,
  type KnownComprobanteKind,
} from "./kind";

// What a unit owes against what its comprobantes document (ADR-0014 §5, #657):
// the one function every emitter asks before it calls ARCA. It is pure, so the
// rule is tested here and the emitter only reads, locks and writes around it.
//
//     delta = derived total − (FC + ΣND − ΣNC)
//
// The first document is the invoice, gated on `Señada` and `total > 0`. After
// it, the sign of the delta names the document: positive → debit note,
// negative → credit note, zero → nothing; neither note has a gate. Every
// note anchors at the invoice (the star), and a credit note may never take
// ΣNC past FC + ΣND: ARCA authorizes one that does (#686), so this check is the
// only thing enforcing the ceiling.

/**
 * One inscription of the unit and what it owes now: its derived total, which
 * on a withdrawn row is what it retained. `null` when no price applies, and
 * then nothing says what it owes.
 */
export type OwedInscription = { id: string; owed: number | null };

/** A comprobante of the unit with what each of its lines documents. */
export type DocumentedComprobante = {
  id: string;
  cbteTipo: number;
  impTotal: number;
  associatedComprobanteId: string | null;
  lines: Array<{ inscriptionId: string | null; amount: number }>;
};

export type PlannedLine = { inscriptionId: string; amount: number };

export type EmissionRefusal =
  // The invoice waits for every active inscription to cover its deposit.
  | "below-deposit"
  // The invoice would bill zero.
  | "nothing-to-bill"
  // After the invoice, what is documented already matches what is owed.
  | "nothing-owed"
  // An inscription has no price, so the unit's total is unknown.
  | "unpriced"
  // The credit note would credit more than the invoice and its debit notes.
  | "over-credit";

export type EmissionPlan<
  TComprobante extends DocumentedComprobante = DocumentedComprobante,
> =
  | {
      ok: true;
      kind: "factura_c";
      amount: number;
      lines: PlannedLine[];
    }
  | {
      ok: true;
      kind: Exclude<KnownComprobanteKind, "factura_c">;
      amount: number;
      // The invoice the note anchors at.
      factura: TComprobante;
      // Signed in the note's own direction: on a debit note an inscription
      // that now owes less carries a negative line, so the lines still sum to
      // the note's total.
      lines: PlannedLine[];
    }
  | {
      ok: false;
      // Every reason that applies, none ahead of another.
      reasons: EmissionRefusal[];
      // Whether the unit already holds its invoice: the refusal is then about
      // a note, and a surface names it so.
      invoiced: boolean;
    };

// A unit is `Señada` when its minimum status reached the deposit. A waived-only
// unit reads `waived`, owes nothing, and is refused by its zero total.
const SENADA: ReadonlySet<InscriptionFinancialStatus> = new Set([
  "depositMet",
  "paidInFull",
  "waived",
]);

export function planAnchorEmission<
  TComprobante extends DocumentedComprobante,
>(input: {
  financialStatus: InscriptionFinancialStatus;
  inscriptions: readonly OwedInscription[];
  // In emission order: the first invoice is the one the star anchors at.
  comprobantes: readonly TComprobante[];
}): EmissionPlan<TComprobante> {
  const anchorDelta = deriveAnchorDelta(input);

  if (!anchorDelta) {
    return planFactura(input);
  }

  const { delta, documentedByInscription: documented, factura } = anchorDelta;

  if (delta === null) {
    return { ok: false, reasons: ["unpriced"], invoiced: true };
  }

  if (delta === 0) {
    return { ok: false, reasons: ["nothing-owed"], invoiced: true };
  }

  const direction = Math.sign(delta);
  const amount = Math.abs(delta);
  const kind = direction > 0 ? "nota_debito_c" : "nota_credito_c";

  if (kind === "nota_credito_c" && exceedsCeiling(factura, input, amount)) {
    return { ok: false, reasons: ["over-credit"], invoiced: true };
  }

  const owedById = new Map(
    input.inscriptions.map((inscription) => [
      inscription.id,
      inscription.owed ?? 0,
    ]),
  );
  const inscriptionIds = [
    ...new Set([...owedById.keys(), ...documented.keys()]),
  ];
  const lines = inscriptionIds.flatMap((inscriptionId) => {
    const lineDelta =
      (owedById.get(inscriptionId) ?? 0) - (documented.get(inscriptionId) ?? 0);

    return lineDelta === 0
      ? []
      : [{ inscriptionId, amount: lineDelta * direction }];
  });

  return { ok: true, kind, amount, factura, lines };
}

/**
 * The two sides of an invoiced unit and their difference, which is the one
 * thing every reader of the delta asks: the emitter to name its document, the
 * finance surfaces to name the anomaly. `null` while the unit holds no invoice,
 * since only after it does the sign name anything.
 */
export type AnchorDelta<
  TComprobante extends DocumentedComprobante = DocumentedComprobante,
> = {
  // The invoice the star anchors at: the first one, in emission order.
  factura: TComprobante;
  // `derived total − (FC + ΣND − ΣNC)`; `null` when an inscription has no
  // price, and then nothing says what the unit owes.
  delta: number | null;
  // `FC + ΣND − ΣNC` over the documents' totals.
  documented: number;
  // The derived total, counting an unpriced row as zero.
  owed: number;
  // What the lines document per inscription, net of the notes. An inscription
  // no line names is absent, which is how the unit tells a row it never
  // invoiced from one it invoiced at zero.
  documentedByInscription: Map<string, number>;
};

export function deriveAnchorDelta<
  TComprobante extends DocumentedComprobante,
>(input: {
  inscriptions: readonly OwedInscription[];
  comprobantes: readonly TComprobante[];
}): AnchorDelta<TComprobante> | null {
  const factura = input.comprobantes.find(
    (comprobante) =>
      readComprobanteKind(comprobante.cbteTipo).kind === "factura_c",
  );

  if (!factura) {
    return null;
  }

  const owed = sumOwed(input.inscriptions);
  const documented = sumDocumented(input.comprobantes);
  const unpriced = input.inscriptions.some(
    (inscription) => inscription.owed === null,
  );

  return {
    factura,
    delta: unpriced ? null : owed - documented,
    documented,
    owed,
    documentedByInscription: documentedByInscription(input.comprobantes),
  };
}

/**
 * What one inscription owes now, as the delta counts it: its derived total,
 * and on a withdrawn row the deposit it retains rather than whatever it still
 * holds (ADR-0014 §6, #1065).
 */
export function deriveOwedAmount(inscription: {
  allocatedAmount: number;
  depositAmount: number | null;
  totalAmount: number | null;
  withdrawn: boolean;
}): number | null {
  return inscription.withdrawn
    ? deriveRetainedAmount(inscription)
    : inscription.totalAmount;
}

function planFactura(input: {
  financialStatus: InscriptionFinancialStatus;
  inscriptions: readonly OwedInscription[];
}): Extract<EmissionPlan, { kind: "factura_c" } | { ok: false }> {
  const amount = sumOwed(input.inscriptions);
  const unpriced = input.inscriptions.some(
    (inscription) => inscription.owed === null,
  );

  // A zero total is said as such before the gate: an empty roster reads
  // `Seña pendiente`, and naming a deposit nobody owes would mislead.
  if (!unpriced && amount <= 0) {
    return { ok: false, reasons: ["nothing-to-bill"], invoiced: false };
  }

  const reasons: EmissionRefusal[] = [
    ...(SENADA.has(input.financialStatus) ? [] : ["below-deposit" as const]),
    ...(unpriced ? ["unpriced" as const] : []),
  ];

  if (reasons.length > 0) {
    return { ok: false, reasons, invoiced: false };
  }

  return {
    ok: true,
    kind: "factura_c",
    amount,
    lines: input.inscriptions.flatMap((inscription) =>
      inscription.owed
        ? [{ inscriptionId: inscription.id, amount: inscription.owed }]
        : [],
    ),
  };
}

/**
 * ΣNC ≤ FC + ΣND over the invoice's star, counting the note about to be
 * emitted. The star is what the status is derived over, so a note that passes
 * here can at most annul the invoice, never credit past it.
 */
function exceedsCeiling(
  factura: DocumentedComprobante,
  input: { comprobantes: readonly DocumentedComprobante[] },
  creditAmount: number,
): boolean {
  let debited = 0;
  let credited = creditAmount;

  for (const comprobante of input.comprobantes) {
    if (comprobante.associatedComprobanteId !== factura.id) {
      continue;
    }

    const { kind } = readComprobanteKind(comprobante.cbteTipo);

    if (kind === "nota_debito_c") {
      debited += comprobante.impTotal;
    } else if (kind === "nota_credito_c") {
      credited += comprobante.impTotal;
    }
  }

  return credited > factura.impTotal + debited;
}

function sumOwed(inscriptions: readonly OwedInscription[]): number {
  return inscriptions.reduce(
    (sum, inscription) => sum + (inscription.owed ?? 0),
    0,
  );
}

// `FC + ΣND − ΣNC` over the documents' totals: the invariant is stated on what
// ARCA authorized, not on the internal lines.
function sumDocumented(comprobantes: readonly DocumentedComprobante[]): number {
  return comprobantes.reduce(
    (sum, comprobante) =>
      sum + documentSign(comprobante.cbteTipo) * comprobante.impTotal,
    0,
  );
}

function documentedByInscription(
  comprobantes: readonly DocumentedComprobante[],
): Map<string, number> {
  const documented = new Map<string, number>();

  for (const comprobante of comprobantes) {
    const sign = documentSign(comprobante.cbteTipo);

    for (const line of comprobante.lines) {
      if (line.inscriptionId === null) {
        continue;
      }
      documented.set(
        line.inscriptionId,
        (documented.get(line.inscriptionId) ?? 0) + sign * line.amount,
      );
    }
  }

  return documented;
}

// A comprobante of an unknown kind documents nothing: no emitter writes one,
// and guessing its direction would move the delta on a code nobody reads.
function documentSign(cbteTipo: number): number {
  return comprobanteKindSign(cbteTipo) ?? 0;
}

/**
 * Why a unit cannot emit, in the operator's words, and what it takes to make
 * the emission possible. The emitter's refusal and the financial detail's
 * blocked dialog read the same sentences, so the menu cannot say one thing and
 * the server another.
 */
export function emissionRefusalLabel(reason: EmissionRefusal): string {
  return emissionRefusalLabels[reason];
}

const emissionRefusalLabels: Record<EmissionRefusal, string> = {
  "below-deposit": "Alguna inscripción todavía no cubrió su seña.",
  "nothing-to-bill": "El total a facturar es $ 0.",
  "nothing-owed": "Lo facturado coincide con el total.",
  unpriced: "Hay inscripciones sin precio.",
  "over-credit":
    "La nota de crédito acreditaría más de lo que la factura y sus notas de débito facturaron.",
};

/** What the next document of the unit waits for, before and after its invoice. */
export function emissionRemedy(invoiced: boolean): string {
  return invoiced
    ? "Se emite una nota de débito o de crédito cuando el total cambia después de facturar, sin acreditar más de lo facturado."
    : "La factura se emite cuando todas las inscripciones activas tienen precio y cubrieron su seña, y el total es mayor que cero.";
}
