export const adminProfessorPageSize = 50;
export const adminProfessorNotFoundMessage = "No encontramos ese Profesor.";

export type AdminProfessorParticipationFilter = "yes" | "no" | "all";
export type AdminProfessorStatusFilter = "active" | "archived" | "all";
export type AdminProfessorParticipationStatus =
  | "participating"
  | "not-participating"
  | "no-event";

export type AdministrativeProfessorListFilters = {
  participation: AdminProfessorParticipationFilter;
  query: string;
  status: AdminProfessorStatusFilter;
  page: number;
};

export function readAdminProfessorParticipationFilter(input: {
  value: string | null;
  hasSelectedEvent: boolean;
}): AdminProfessorParticipationFilter {
  if (input.value === "si") {
    return "yes";
  }

  if (input.value === "no") {
    return "no";
  }

  if (input.value === "todos") {
    return "all";
  }

  return input.hasSelectedEvent ? "yes" : "all";
}

export function readAdminProfessorStatusFilter(
  value: string | null,
): AdminProfessorStatusFilter {
  if (value === "archivados") {
    return "archived";
  }

  if (value === "todos") {
    return "all";
  }

  return "active";
}

export function toAdminProfessorParticipationSearchValue(
  value: AdminProfessorParticipationFilter,
) {
  if (value === "no") {
    return "no";
  }

  if (value === "all") {
    return "todos";
  }

  return "si";
}

export function toAdminProfessorStatusSearchValue(
  value: AdminProfessorStatusFilter,
) {
  if (value === "archived") {
    return "archivados";
  }

  if (value === "all") {
    return "todos";
  }

  return "activos";
}

export function getAdminProfessorParticipationLabel(
  participationStatus: AdminProfessorParticipationStatus,
) {
  if (participationStatus === "participating") {
    return "Participando";
  }

  if (participationStatus === "not-participating") {
    return "No participando";
  }

  return "Sin evento";
}

export function getAdminProfessorParticipationSummary(
  participationStatus: AdminProfessorParticipationStatus,
) {
  if (participationStatus === "participating") {
    return "Participando en el Evento de trabajo.";
  }

  if (participationStatus === "not-participating") {
    return "No participa en el Evento de trabajo.";
  }

  return "Sin evento de trabajo seleccionado.";
}

export function formatAdminProfessorDocument(input: {
  documentType: "dni" | "passport" | "other" | null;
  documentNumber: string | null;
}) {
  if (!input.documentType || !input.documentNumber) {
    return "Sin documento cargado";
  }

  if (input.documentType === "dni") {
    return `DNI ${input.documentNumber}`;
  }

  if (input.documentType === "passport") {
    return `Pasaporte ${input.documentNumber}`;
  }

  return `Otro ${input.documentNumber}`;
}
