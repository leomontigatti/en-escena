/**
 * `rosterPersonStatus` —ui: "Estado de alta"— is the alta state of a roster
 * person: a bailarín or a profesor an academy either still works with or has
 * archived. It is stored as the `active` boolean on `dancer` and `professor`,
 * and this module is the only place that boolean is turned into a concept:
 * readers branch on the status, never on the column.
 *
 * "Archivado" names this and only this. It is a third axis, independent of
 * Estado de participación and of Estado de verificación de bailarín, and it
 * touches no inscription, no Estado operativo and no figure.
 *
 * This is the pure half —usable from views and from tests— and it imports
 * nothing. The query predicate, its raw-SQL twin and the filter condition live
 * in `roster-person-status.server.ts`.
 */
export type RosterPersonStatus = "active" | "archived";

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
