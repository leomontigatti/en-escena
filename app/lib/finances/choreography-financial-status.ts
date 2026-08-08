import type {
  InscriptionAnomaly,
  InscriptionFinancialStatus,
  InscriptionStatusBadge,
} from "@/lib/finances/inscription-financial-status";

const inscriptionFinancialStatusLabels = {
  depositPending: "Seña pendiente",
  depositMet: "Señada",
  paidInFull: "Pagada",
} as const satisfies Record<InscriptionFinancialStatus, string>;

const inscriptionFinancialStatusBadgeVariants = {
  depositPending: "warning",
  depositMet: "info",
  paidInFull: "success",
} as const satisfies Record<InscriptionFinancialStatus, string>;

const inscriptionAnomalyLabels = {
  overAllocated: "Sobreasignada",
} as const satisfies Record<InscriptionAnomaly, string>;

/**
 * `Sobreasignada` es `destructive`, no ámbar: al lado de `Seña pendiente` dos
 * badges ámbar se leerían como un mismo tipo de hecho.
 */
const inscriptionAnomalyBadgeVariants = {
  overAllocated: "destructive",
} as const satisfies Record<InscriptionAnomaly, string>;

export const inscriptionFinancialStatusOptions = [
  { label: "Seña pendiente", value: "depositPending" },
  { label: "Señada", value: "depositMet" },
  { label: "Pagada", value: "paidInFull" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: InscriptionFinancialStatus;
}>;

export function formatInscriptionFinancialStatus(
  value: InscriptionFinancialStatus,
) {
  return inscriptionFinancialStatusLabels[value];
}

export function getInscriptionFinancialStatusBadgeVariant(
  value: InscriptionFinancialStatus,
) {
  return inscriptionFinancialStatusBadgeVariants[value];
}

/**
 * `Retirada` is a separate derived axis —like `Facturada`—, not a fourth value
 * of the status enum, so it has its own label and its own variant. Neutral on
 * purpose: a withdrawn inscription is not asking anyone to do anything, it only
 * says that the money sitting on it was retained.
 */
const withdrawnInscriptionLabel = "Retirada";
const withdrawnInscriptionBadgeVariant = "secondary";

/**
 * The only translator of the `Estado` column badge: the precedence between axes
 * is decided by `resolveInscriptionStatusBadge`, and here it is given a label, a
 * variant and the key it filters by. `value` is the same string for all three
 * shapes because the three value spaces are disjoint, and that is what keeps the
 * column filter from diverging from what the cell shows.
 */
type FormattedInscriptionStatusBadge = {
  kind: InscriptionStatusBadge["kind"];
  label: string;
  value: string;
  variant:
    | (typeof inscriptionFinancialStatusBadgeVariants)[InscriptionFinancialStatus]
    | (typeof inscriptionAnomalyBadgeVariants)[InscriptionAnomaly]
    | typeof withdrawnInscriptionBadgeVariant;
};

export function formatInscriptionStatusBadge(
  badge: InscriptionStatusBadge,
): FormattedInscriptionStatusBadge {
  if (badge.kind === "withdrawn") {
    return {
      kind: badge.kind,
      label: withdrawnInscriptionLabel,
      value: "withdrawn",
      variant: withdrawnInscriptionBadgeVariant,
    };
  }

  if (badge.kind === "anomaly") {
    return {
      kind: badge.kind,
      label: inscriptionAnomalyLabels[badge.anomaly],
      value: badge.anomaly,
      variant: inscriptionAnomalyBadgeVariants[badge.anomaly],
    };
  }

  return {
    kind: badge.kind,
    label: inscriptionFinancialStatusLabels[badge.status],
    value: badge.status,
    variant: inscriptionFinancialStatusBadgeVariants[badge.status],
  };
}

/**
 * The options of the financial list's `Estado` filter: exactly the badges that
 * column can show. Filtering by what is visible is the only possible reading of
 * a filter over a column, and a row badged `Sobreasignada` that turned up under
 * `Señada` would be a contradiction on screen.
 *
 * `Retirada` is not there: a choreography is not withdrawn —inscriptions are—,
 * and offering an option that can never match is offering an empty list.
 */
export const choreographyStatusFilterOptions = [
  ...inscriptionFinancialStatusOptions,
  { label: inscriptionAnomalyLabels.overAllocated, value: "overAllocated" },
] as const satisfies ReadonlyArray<{ label: string; value: string }>;
