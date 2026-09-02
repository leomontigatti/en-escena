/**
 * `rosterPersonStatus` —ui: "Estado de alta"— is the roster state of a person:
 * a dancer or a professor an academy either still works with or has archived.
 * It is stored as the `active` boolean on `dancer` and `professor`,
 * and this module is the only place that boolean is turned into a concept:
 * readers branch on the status, never on the column.
 *
 * "Archivado" names this and only this. It is a third axis, independent of
 * the participation status and of the dancer verification status, and it
 * touches no inscription, no operational status and no figure.
 *
 * This is the pure half —usable from views and from tests— and it imports
 * nothing. The query predicate and the filter condition live
 * in `roster-person-status.server.ts`.
 */
export type RosterPersonStatus = "active" | "archived";

/** The two person kinds that carry the axis. */
export type RosterPersonKind = "dancer" | "professor";

/**
 * The filter adds "all" to the two states. Every caller that omits the filter
 * gets `"active"`: an administrative list without an `estado` parameter shows
 * the people the academy still works with.
 */
export type RosterPersonStatusFilter = RosterPersonStatus | "all";

export const defaultRosterPersonStatusFilter: RosterPersonStatusFilter =
  "active";

/** The URL parameter both administrative lists filter this axis through. */
const rosterPersonStatusSearchParam = "estado";

export function toRosterPersonStatus(active: boolean): RosterPersonStatus {
  return active ? "active" : "archived";
}

export function readRosterPersonStatusFilter(
  searchParams: URLSearchParams,
): RosterPersonStatusFilter {
  switch (searchParams.get(rosterPersonStatusSearchParam)) {
    case "archivados":
      return "archived";
    case "todos":
      return "all";
    default:
      return defaultRosterPersonStatusFilter;
  }
}

/** `active` is encoded by the absence of the parameter, so it returns `null`. */
export function toRosterPersonStatusSearchValue(
  filter: RosterPersonStatusFilter,
) {
  switch (filter) {
    case "archived":
      return "archivados";
    case "all":
      return "todos";
    case "active":
      return null;
  }
}

export function getRosterPersonStatusLabel(status: RosterPersonStatus) {
  switch (status) {
    case "active":
      return "Activo";
    case "archived":
      return "Archivado";
  }
}

export function getRosterPersonStatusBadgeVariant(status: RosterPersonStatus) {
  return status === "active" ? "success" : "destructive";
}

/**
 * The one eligibility rule: a roster person can be picked for a choreography
 * when they are active, or when they are already on that choreography. The
 * grandfather half is what keeps archiving from stranding a record — an
 * archived person who is already linked stays offered, stays saveable, and
 * archiving is never refused because of them.
 *
 * `isAlreadyLinked` means linked to **this** choreography — not to any
 * choreography of the current event, and not to any choreography ever. A wider
 * scope would let one choreography's roster leak into another's picker, and the
 * widest would make archiving cosmetic for anyone with history. The function
 * cannot enforce that scope on its own: the caller owns the set it passes.
 *
 * Registration passes an empty linked set, which is what makes its strict
 * behaviour a consequence of this rule rather than a second rule.
 */
export function isSelectableForRoster(input: {
  status: RosterPersonStatus;
  isAlreadyLinked: boolean;
}) {
  return input.status === "active" || input.isAlreadyLinked;
}

/**
 * What the archive confirmation tells the academy before it confirms, and the
 * reason archiving needs no guard: it is roster hygiene, so the choreographies
 * the person is already on keep them. The sentence is static — it queries
 * nothing — and it lives here so that the four archive confirmations cannot
 * promise four different things.
 */
export function getArchiveKeepsRosterMessage(kind: RosterPersonKind) {
  switch (kind) {
    case "dancer":
      return "Las inscripciones existentes no cambian: seguirá en las coreografías en las que ya está.";
    case "professor":
      return "Las coreografías existentes no cambian: seguirá en las que ya está.";
  }
}
