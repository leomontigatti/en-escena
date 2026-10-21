import {
  FACTURA_C_CBTE_TIPO,
  NOTA_CREDITO_C_CBTE_TIPO,
  NOTA_DEBITO_C_CBTE_TIPO,
} from "./arca/factura-c";

// The comprobante's identity (#657, ADR-0014 §5): the only place outside the
// ARCA adapter that interprets the persisted `cbteTipo`. Everything that names,
// colours, prints or signs a comprobante by its kind reads it here, so a fourth
// kind is one entry and not a hunt for comparisons.

export const comprobanteKinds = [
  "factura_c",
  "nota_debito_c",
  "nota_credito_c",
] as const;

export type KnownComprobanteKind = (typeof comprobanteKinds)[number];

// Total over the stored integer: a code nobody emits still resolves, to a kind
// that carries the raw number, so no reader hides unexpected data.
export type ComprobanteKind =
  { kind: KnownComprobanteKind } | { kind: "unknown"; cbteTipo: number };

// The literal matches the Badge component's variants without coupling the lib
// to the UI layer.
type ComprobanteKindBadgeVariant = "info" | "secondary" | "warning" | "outline";

type KnownKindTraits = {
  cbteTipo: number;
  label: string;
  initials: string;
  // `Factura C` is blue and `Nota de crédito C` yellow, to tell an invoice from
  // what takes money off it at a glance.
  badgeVariant: ComprobanteKindBadgeVariant;
  printTitle: string;
  // What the document does to what the unit is invoiced for.
  sign: 1 | -1;
};

const knownKindTraits: Record<KnownComprobanteKind, KnownKindTraits> = {
  factura_c: {
    cbteTipo: FACTURA_C_CBTE_TIPO,
    label: "Factura C",
    initials: "FC",
    badgeVariant: "info",
    printTitle: "Factura C",
    sign: 1,
  },
  nota_debito_c: {
    cbteTipo: NOTA_DEBITO_C_CBTE_TIPO,
    label: "Nota de débito C",
    initials: "ND",
    badgeVariant: "secondary",
    printTitle: "Nota de Débito C",
    sign: 1,
  },
  nota_credito_c: {
    cbteTipo: NOTA_CREDITO_C_CBTE_TIPO,
    label: "Nota de crédito C",
    initials: "NC",
    badgeVariant: "warning",
    printTitle: "Nota de Crédito C",
    sign: -1,
  },
};

export function readComprobanteKind(cbteTipo: number): ComprobanteKind {
  const kind = comprobanteKinds.find(
    (candidate) => knownKindTraits[candidate].cbteTipo === cbteTipo,
  );

  return kind === undefined ? { kind: "unknown", cbteTipo } : { kind };
}

export function comprobanteKindCbteTipo(kind: KnownComprobanteKind): number {
  return knownKindTraits[kind].cbteTipo;
}

export function formatComprobanteKindLabel(cbteTipo: number): string {
  const kind = readComprobanteKind(cbteTipo);

  return kind.kind === "unknown"
    ? `Comprobante ${kind.cbteTipo}`
    : knownKindTraits[kind.kind].label;
}

// The list's type column has the width of two letters; the full label stays as
// the badge's `title`, so nothing is lost when it shrinks.
export function formatComprobanteKindInitials(cbteTipo: number): string {
  const kind = readComprobanteKind(cbteTipo);

  return kind.kind === "unknown"
    ? `C${kind.cbteTipo}`
    : knownKindTraits[kind.kind].initials;
}

export function comprobanteKindBadgeVariant(
  cbteTipo: number,
): ComprobanteKindBadgeVariant {
  const kind = readComprobanteKind(cbteTipo);

  return kind.kind === "unknown"
    ? "outline"
    : knownKindTraits[kind.kind].badgeVariant;
}

// The printed header: a large letter, the 3-digit ARCA code and a title. An
// unknown code keeps its number and claims no letter, since the letter is part
// of what the code would have said.
export type ComprobantePrintHeader = {
  letter: string;
  code: string;
  title: string;
};

export function comprobantePrintHeader(
  cbteTipo: number,
): ComprobantePrintHeader {
  const kind = readComprobanteKind(cbteTipo);
  const code = String(cbteTipo).padStart(3, "0");

  return kind.kind === "unknown"
    ? { letter: "—", code, title: `Comprobante ${kind.cbteTipo}` }
    : { letter: "C", code, title: knownKindTraits[kind.kind].printTitle };
}

// The amount as it counts toward what the unit is invoiced for: a credit note
// reads negative. An unknown kind is shown as it was stored.
export function signedComprobanteAmount(comprobante: {
  cbteTipo: number;
  impTotal: number;
}): number {
  const kind = readComprobanteKind(comprobante.cbteTipo);
  const sign = kind.kind === "unknown" ? 1 : knownKindTraits[kind.kind].sign;

  return sign * comprobante.impTotal;
}
