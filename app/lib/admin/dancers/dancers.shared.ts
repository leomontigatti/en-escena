import {
  buildCanonicalListSearch,
  type ListOrder,
  type ListQuerySpec,
} from "@/lib/list-query/list-query";
import {
  toRosterPersonStatusSearchValue,
  type RosterPersonStatusFilter,
} from "@/lib/roster/roster-person-status.shared";

export const dancerNotFoundMessage = "No encontramos ese Bailarín.";

export type DancerParticipationFilter = "yes" | "no" | "all";
export type DancerIdentificationFilter =
  "incomplete" | "unverified" | "verified" | "all";
export type DancerIdentificationStatus =
  "incomplete" | "unverified" | "verified";

export type DancerListFilters = {
  /** A `YYYY-MM-DD` the event's choreographies fall on, or `null` for any. */
  day: string | null;
  order: ListOrder<"nombre">;
  participation: DancerParticipationFilter;
  query: string;
  status: RosterPersonStatusFilter;
  identification: DancerIdentificationFilter;
  page: number;
};

/** The dancer list sorts by name alone, ascending unless asked otherwise. */
export const dancerListSpec: ListQuerySpec<"nombre"> = {
  orderColumnIds: ["nombre"],
  defaultOrder: { columnId: "nombre", direction: "asc" },
};

/**
 * The list's facets as the URL writes them, each absent at its default.
 * Participation and the day only narrow the list while an event is active, so
 * without one they are not written at all.
 */
export function toDancerListFacets(
  filters: DancerListFilters,
  selectedEventId: string | null,
) {
  return {
    participando:
      selectedEventId === null
        ? null
        : toDancerParticipationSearchValue(filters.participation),
    dia: selectedEventId === null ? null : filters.day,
    identificacion:
      filters.identification === "all"
        ? null
        : toDancerIdentificationSearchValue(filters.identification),
    estado: toRosterPersonStatusSearchValue(filters.status),
  };
}

/** What the list applied, as its canonical address is written from it. */
export function toDancerAppliedListQuery(
  filters: DancerListFilters,
  selectedEventId: string | null,
) {
  return {
    facets: toDancerListFacets(filters, selectedEventId),
    query: {
      order: filters.order,
      page: filters.page,
      search: filters.query,
    },
    spec: dancerListSpec,
  };
}

/** The list's canonical query string, carried to a detail screen and back. */
export function buildDancerListSearch(
  filters: DancerListFilters,
  selectedEventId: string | null,
) {
  return buildCanonicalListSearch({
    ...toDancerAppliedListQuery(filters, selectedEventId),
    currentSearch: "",
  });
}

export function readDancerParticipationFilter(
  value: string | null,
): DancerParticipationFilter {
  switch (value) {
    case "si":
      return "yes";
    case "no":
      return "no";
    default:
      return "all";
  }
}

export function readDancerIdentificationFilter(
  value: string | null,
): DancerIdentificationFilter {
  switch (value) {
    case "incompleta":
      return "incomplete";
    case "sin-verificar":
      return "unverified";
    case "verificados":
      return "verified";
    case "todos":
      return "all";
    default:
      return "all";
  }
}

/** `all` is encoded by the absence of the parameter, so it returns `null`. */
export function toDancerParticipationSearchValue(
  value: DancerParticipationFilter,
) {
  switch (value) {
    case "no":
      return "no";
    case "all":
      return null;
    default:
      return "si";
  }
}

function toDancerIdentificationSearchValue(value: DancerIdentificationFilter) {
  switch (value) {
    case "unverified":
      return "sin-verificar";
    case "verified":
      return "verificados";
    case "all":
      return "todos";
    default:
      return "incompleta";
  }
}

export function getDancerIdentificationBadgeVariant(
  identificationStatus: DancerIdentificationStatus,
) {
  if (identificationStatus === "verified") {
    return "success";
  }

  if (identificationStatus === "unverified") {
    return "info";
  }

  return "warning";
}
