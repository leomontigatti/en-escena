import type { RosterPersonStatusFilter } from "@/lib/roster/roster-person-status.shared";

export const professorPageSize = 50;
export const professorNotFoundMessage = "No encontramos ese Profesor.";

export type ProfessorParticipationFilter = "yes" | "no" | "all";
export type ProfessorNameOrder = "asc" | "desc";

export type ProfessorListFilters = {
  nameOrder: ProfessorNameOrder;
  participation: ProfessorParticipationFilter;
  query: string;
  status: RosterPersonStatusFilter;
  page: number;
};

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
