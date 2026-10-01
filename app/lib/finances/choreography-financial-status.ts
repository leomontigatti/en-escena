import type {
  InscriptionAnomaly,
  InscriptionFinancialStatus,
  InscriptionStatusBadge,
} from "@/lib/finances/inscription-financial-status";

const inscriptionFinancialStatusLabels = {
  depositPending: "Seña pendiente",
  depositMet: "Señada",
  paidInFull: "Pagada",
  waived: "Bonificada",
} as const satisfies Record<InscriptionFinancialStatus, string>;

const inscriptionFinancialStatusBadgeVariants = {
  depositPending: "warning",
  depositMet: "info",
  paidInFull: "success",
  // Green like `Pagada`: both owe nothing. The label is what tells a free place
  // from a paid one (ADR-0017).
  waived: "success",
} as const satisfies Record<InscriptionFinancialStatus, string>;

const inscriptionAnomalyLabels = {
  overAllocated: "Sobreasignada",
} as const satisfies Record<InscriptionAnomaly, string>;

/**
 * `Sobreasignada` is `destructive`, not amber: next to `Seña pendiente`, two
 * amber badges would read as the same kind of fact.
 */
const inscriptionAnomalyBadgeVariants = {
  overAllocated: "destructive",
} as const satisfies Record<InscriptionAnomaly, string>;

/**
 * The paying scale's options. `Bonificada` is not among them: a seminar
 * inscription cannot be waived, and the seminar filters build on this list.
 */
export const inscriptionFinancialStatusOptions = [
  { label: "Seña pendiente", value: "depositPending" },
  { label: "Señada", value: "depositMet" },
  { label: "Pagada", value: "paidInFull" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: InscriptionFinancialStatus;
}>;

/**
 * The `Bonificada` option (ADR-0017), for the filters over choreographies and
 * their inscriptions: the only rows that can be waived.
 */
const waivedStatusFilterOption = {
  label: inscriptionFinancialStatusLabels.waived,
  value: "waived",
} as const satisfies { label: string; value: InscriptionFinancialStatus };

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
 * The `Retirada` option, shared by every `Estado` filter that can badge a row
 * with it. Its `value` is the badge's, so the filter and the cell cannot drift.
 */
export const withdrawnStatusFilterOption = {
  label: withdrawnInscriptionLabel,
  value: "withdrawn",
} as const satisfies { label: string; value: string };

/**
 * The options of the financial list's `Estado` filter: exactly the badges that
 * column can show. Filtering by what is visible is the only possible reading of
 * a filter over a column, and a row badged `Sobreasignada` that turned up under
 * `Señada` would be a contradiction on screen.
 *
 * `Retirada` is among them: a choreography **is** withdrawn —it carries its own
 * `withdrawnAt`—, the financial lists always show it so its retained money stays
 * in sight, and the badge replaces its financial status there.
 */
export const choreographyStatusFilterOptions = [
  ...inscriptionFinancialStatusOptions,
  waivedStatusFilterOption,
  { label: inscriptionAnomalyLabels.overAllocated, value: "overAllocated" },
  withdrawnStatusFilterOption,
] as const satisfies ReadonlyArray<{ label: string; value: string }>;

/**
 * The `Estado` column of a list of inscriptions badges the same three axes as a
 * list of choreographies, so it offers the same options. The two names are kept
 * apart because the two columns are: what they share is that both are
 * `formatInscriptionStatusBadge`'s whole range.
 */
export const inscriptionStatusFilterOptions = choreographyStatusFilterOptions;
