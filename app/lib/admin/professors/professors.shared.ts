export const professorPageSize = 50;
export const professorNotFoundMessage = "No encontramos ese Profesor.";

export type ProfessorParticipationFilter = "yes" | "no" | "all";
export type ProfessorStatusFilter = "active" | "archived" | "all";
export type ProfessorNameOrder = "asc" | "desc";

export type ProfessorListFilters = {
  nameOrder: ProfessorNameOrder;
  participation: ProfessorParticipationFilter;
  query: string;
  status: ProfessorStatusFilter;
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

export function readProfessorStatusFilter(
  value: string | null,
): ProfessorStatusFilter {
  if (value === "archivados") {
    return "archived";
  }

  if (value === "todos") {
    return "all";
  }

  return "active";
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

/** `active` is encoded by the absence of the parameter, so it returns `null`. */
export function toProfessorStatusSearchValue(value: ProfessorStatusFilter) {
  if (value === "archived") {
    return "archivados";
  }

  if (value === "all") {
    return "todos";
  }

  return null;
}
