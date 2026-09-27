import {
  buildCanonicalListSearch,
  type ListOrder,
  type ListQuerySpec,
} from "@/lib/list-query/list-query";
import {
  toRosterPersonStatusSearchValue,
  type RosterPersonStatusFilter,
} from "@/lib/roster/roster-person-status.shared";

export const professorNotFoundMessage = "No encontramos ese Profesor.";

export type ProfessorParticipationFilter = "yes" | "no" | "all";

export type ProfessorListFilters = {
  order: ListOrder<"nombre">;
  participation: ProfessorParticipationFilter;
  query: string;
  status: RosterPersonStatusFilter;
  page: number;
};

/** The professor list sorts by name alone, ascending unless asked otherwise. */
export const professorListSpec: ListQuerySpec<"nombre"> = {
  orderColumnIds: ["nombre"],
  defaultOrder: { columnId: "nombre", direction: "asc" },
};

/**
 * The list's facets as the URL writes them, each absent at its default.
 * Participation only narrows the list while an event is active, so without one
 * it is not written at all.
 */
export function toProfessorListFacets(
  filters: ProfessorListFilters,
  selectedEventId: string | null,
) {
  return {
    participando:
      selectedEventId === null
        ? null
        : toProfessorParticipationSearchValue(filters.participation),
    estado: toRosterPersonStatusSearchValue(filters.status),
  };
}

/** What the list applied, as its canonical address is written from it. */
export function toProfessorAppliedListQuery(
  filters: ProfessorListFilters,
  selectedEventId: string | null,
) {
  return {
    facets: toProfessorListFacets(filters, selectedEventId),
    query: {
      order: filters.order,
      page: filters.page,
      search: filters.query,
    },
    spec: professorListSpec,
  };
}

/** The list's canonical query string, carried to a detail screen and back. */
export function buildProfessorListSearch(
  filters: ProfessorListFilters,
  selectedEventId: string | null,
) {
  return buildCanonicalListSearch({
    ...toProfessorAppliedListQuery(filters, selectedEventId),
    currentSearch: "",
  });
}

export function readProfessorParticipationFilter(
  value: string | null,
): ProfessorParticipationFilter {
  if (value === "si") {
    return "yes";
  }

  if (value === "no") {
    return "no";
  }

  return "all";
}

/** `all` is encoded by the absence of the parameter, so it returns `null`. */
export function toProfessorParticipationSearchValue(
  value: ProfessorParticipationFilter,
) {
  if (value === "no") {
    return "no";
  }

  if (value === "all") {
    return null;
  }

  return "si";
}
