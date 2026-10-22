import type {
  InscriptionAnomaly,
  InscriptionFinancialStatus,
  InscriptionStatusBadge,
} from "@/lib/finances/inscription-financial-status";
import { rosterPersonNoun } from "@/lib/roster/roster-person-kind.shared";

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
  pendingDebitNote: "Pendiente de facturar",
  pendingCreditNote: "Pendiente de acreditar",
} as const satisfies Record<InscriptionAnomaly, string>;

/**
 * `Sobreasignada` is `destructive`, not amber: next to `Seña pendiente`, two
 * amber badges would read as the same kind of fact. The billing pair is too:
 * each is a document someone has to emit.
 */
const inscriptionAnomalyBadgeVariants = {
  overAllocated: "destructive",
  pendingDebitNote: "destructive",
  pendingCreditNote: "destructive",
} as const satisfies Record<InscriptionAnomaly, string>;

/**
 * `Sin facturar`: a row the unit's invoice does not name. Outlined, since it
 * is neither a state of the money nor an anomaly of its own — the unit's
 * `Pendiente de facturar` is the anomaly, and this says which rows it is for.
 */
const uninvoicedInscriptionLabel = "Sin facturar";
const uninvoicedInscriptionBadgeVariant = "outline";

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
export const waivedStatusFilterOption = {
  label: inscriptionFinancialStatusLabels.waived,
  value: "waived",
} as const satisfies { label: string; value: InscriptionFinancialStatus };

/**
 * `Retirada` is a separate derived axis, not a fourth value
 * of the status enum, so it has its own label and its own variant. Neutral on
 * purpose: a withdrawn inscription is not asking anyone to do anything, it only
 * says that the money sitting on it was retained.
 */
const withdrawnInscriptionLabel = "Retirada";
const withdrawnInscriptionBadgeVariant = "secondary";

/**
 * `Reservada`: a seminar inscription whose deposit is still owed but which holds
 * a reserved place. Amber like `Seña pendiente`, because both ask for the same
 * thing; the label tells a place held from one not held.
 */
const reservedInscriptionLabel = "Reservada";
const reservedInscriptionBadgeVariant = "warning";

/**
 * `Particular`: a linked individual's seminar inscription in an academy's
 * finances (ADR-0019). The label is the inscription person kind's own noun, so
 * this badge and the `Tipo` badge cannot name it two ways. Neutral like
 * `Retirada`: it asks the academy for nothing.
 */
const linkedIndividualInscriptionLabel = rosterPersonNoun(
  "individual",
  "singularCapitalized",
);
const linkedIndividualInscriptionBadgeVariant = "secondary";

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
    | typeof linkedIndividualInscriptionBadgeVariant
    | typeof reservedInscriptionBadgeVariant
    | typeof uninvoicedInscriptionBadgeVariant
    | typeof withdrawnInscriptionBadgeVariant;
};

export function formatInscriptionStatusBadge(
  badge: InscriptionStatusBadge,
): FormattedInscriptionStatusBadge {
  if (badge.kind === "linkedIndividual") {
    return {
      kind: badge.kind,
      label: linkedIndividualInscriptionLabel,
      value: linkedIndividualStatusFilterOption.value,
      variant: linkedIndividualInscriptionBadgeVariant,
    };
  }

  if (badge.kind === "withdrawn") {
    return {
      kind: badge.kind,
      label: withdrawnInscriptionLabel,
      value: "withdrawn",
      variant: withdrawnInscriptionBadgeVariant,
    };
  }

  if (badge.kind === "reserved") {
    return {
      kind: badge.kind,
      label: reservedInscriptionLabel,
      value: "reserved",
      variant: reservedInscriptionBadgeVariant,
    };
  }

  if (badge.kind === "uninvoiced") {
    return {
      kind: badge.kind,
      label: uninvoicedInscriptionLabel,
      value: uninvoicedStatusFilterOption.value,
      variant: uninvoicedInscriptionBadgeVariant,
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
 * The `Particular` option, for the academy's seminar lists: its seminar
 * financial detail badges a linked individual's row with it, and its
 * `Seminarios` tab a seminar only linked individuals are in.
 */
export const linkedIndividualStatusFilterOption = {
  label: linkedIndividualInscriptionLabel,
  value: "linkedIndividual",
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
 * The administration's lists of units — an academy's choreographies and its
 * `(seminar, academy)` units — can also badge what the unit's documents leave
 * pending. The academy is told nothing when its bill moves (ADR-0014 §10), so
 * the portal's filters never offer them.
 */
export const adminUnitStatusFilterOptions = [
  {
    label: inscriptionAnomalyLabels.pendingDebitNote,
    value: "pendingDebitNote",
  },
  {
    label: inscriptionAnomalyLabels.pendingCreditNote,
    value: "pendingCreditNote",
  },
  ...choreographyStatusFilterOptions,
] as const satisfies ReadonlyArray<{ label: string; value: string }>;

/**
 * The `Sin facturar` option, for the administration's financial details: the
 * only inscription lists that read the `Facturada` axis.
 */
export const uninvoicedStatusFilterOption = {
  label: uninvoicedInscriptionLabel,
  value: "uninvoiced",
} as const satisfies { label: string; value: string };

/**
 * The `Estado` column of a list of inscriptions badges the same three axes as a
 * list of choreographies, so it offers the same options. The two names are kept
 * apart because the two columns are: what they share is that both are
 * `formatInscriptionStatusBadge`'s whole range.
 */
export const inscriptionStatusFilterOptions = choreographyStatusFilterOptions;

/**
 * A list of **seminar** inscriptions can also badge a row `Reservada`, so its
 * `Estado` filter offers it, first: it is the state a new registration starts
 * in.
 */
export const seminarInscriptionStatusFilterOptions = [
  { label: reservedInscriptionLabel, value: "reserved" },
  ...inscriptionStatusFilterOptions,
] as const satisfies ReadonlyArray<{ label: string; value: string }>;

// A `Map` and not an object: the value comes from the URL, and `constructor`
// must find nothing rather than what every object inherits.
const inscriptionStatusFilterBadgeVariants = new Map<
  string,
  FormattedInscriptionStatusBadge["variant"]
>(
  Object.entries({
    ...inscriptionFinancialStatusBadgeVariants,
    ...inscriptionAnomalyBadgeVariants,
    reserved: reservedInscriptionBadgeVariant,
    [uninvoicedStatusFilterOption.value]: uninvoicedInscriptionBadgeVariant,
    [linkedIndividualStatusFilterOption.value]:
      linkedIndividualInscriptionBadgeVariant,
    [withdrawnStatusFilterOption.value]: withdrawnInscriptionBadgeVariant,
  }),
);

/**
 * The variant an option of the `Estado` filter wears once applied: the one
 * `formatInscriptionStatusBadge` gives the badge of the same `value`, so the
 * applied filter reads as the rows it narrows to.
 */
export function getInscriptionStatusFilterBadgeVariant(value: string) {
  return inscriptionStatusFilterBadgeVariants.get(value) ?? "secondary";
}
