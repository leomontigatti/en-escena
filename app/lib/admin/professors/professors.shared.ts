export const professorPageSize = 50;
export const professorNotFoundMessage = "No encontramos ese Profesor.";

export type ProfessorParticipationFilter = "yes" | "no" | "all";
export type ProfessorStatusFilter = "active" | "archived" | "all";
export type ProfessorNameOrder = "asc" | "desc";
export type ProfessorAuditAction = "update" | "archive" | "reactivate";

export type ProfessorListFilters = {
  nameOrder: ProfessorNameOrder;
  participation: ProfessorParticipationFilter;
  query: string;
  status: ProfessorStatusFilter;
  page: number;
};

export function readProfessorParticipationFilter(input: {
  value: string | null;
}): ProfessorParticipationFilter {
  if (input.value === "si") {
    return "yes";
  }

  if (input.value === "no") {
    return "no";
  }

  if (input.value === "todos") {
    return "all";
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

export function toProfessorParticipationSearchValue(
  value: ProfessorParticipationFilter,
) {
  if (value === "no") {
    return "no";
  }

  if (value === "all") {
    return "todos";
  }

  return "si";
}

/** `active` se codifica por ausencia del parámetro, así que devuelve `null`. */
export function toProfessorStatusSearchValue(value: ProfessorStatusFilter) {
  if (value === "archived") {
    return "archivados";
  }

  if (value === "all") {
    return "todos";
  }

  return null;
}
