export const adminDancerPageSize = 50;
export const adminDancerNotFoundMessage = "No encontramos ese Bailarín.";

export type AdminDancerParticipationFilter = "yes" | "no" | "all";
export type AdminDancerStatusFilter = "active" | "archived" | "all";
export type AdminDancerIdentificationFilter =
  | "incomplete"
  | "missing-images"
  | "all";
export type AdminDancerParticipationStatus =
  | "participating"
  | "not-participating"
  | "no-event";
export type AdminDancerIdentificationStatus = "incomplete" | "missing-images";

export type AdministrativeDancerListFilters = {
  participation: AdminDancerParticipationFilter;
  query: string;
  status: AdminDancerStatusFilter;
  identification: AdminDancerIdentificationFilter;
  page: number;
};

export function readAdminDancerParticipationFilter(input: {
  value: string | null;
  hasSelectedEvent: boolean;
}): AdminDancerParticipationFilter {
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

export function readAdminDancerStatusFilter(
  value: string | null,
): AdminDancerStatusFilter {
  if (value === "archivados") {
    return "archived";
  }

  if (value === "todos") {
    return "all";
  }

  return "active";
}

export function readAdminDancerIdentificationFilter(
  value: string | null,
): AdminDancerIdentificationFilter {
  if (value === "sin-imagenes") {
    return "missing-images";
  }

  if (value === "todos") {
    return "all";
  }

  return "all";
}

export function toAdminDancerParticipationSearchValue(
  value: AdminDancerParticipationFilter,
) {
  if (value === "no") {
    return "no";
  }

  if (value === "all") {
    return "todos";
  }

  return "si";
}

export function toAdminDancerStatusSearchValue(value: AdminDancerStatusFilter) {
  if (value === "archived") {
    return "archivados";
  }

  if (value === "all") {
    return "todos";
  }

  return "activos";
}

export function toAdminDancerIdentificationSearchValue(
  value: AdminDancerIdentificationFilter,
) {
  if (value === "missing-images") {
    return "sin-imagenes";
  }

  if (value === "all") {
    return "todos";
  }

  return "incompleta";
}

export function getAdminDancerParticipationLabel(
  participationStatus: AdminDancerParticipationStatus,
) {
  if (participationStatus === "participating") {
    return "Participando";
  }

  if (participationStatus === "not-participating") {
    return "No participando";
  }

  return "Sin evento";
}

export function getAdminDancerParticipationSummary(
  participationStatus: AdminDancerParticipationStatus,
) {
  if (participationStatus === "participating") {
    return "Participando en el Evento de trabajo.";
  }

  if (participationStatus === "not-participating") {
    return "No participa en el Evento de trabajo.";
  }

  return "Sin evento de trabajo seleccionado.";
}

export function getAdminDancerIdentificationLabel(
  identificationStatus: AdminDancerIdentificationStatus,
) {
  if (identificationStatus === "missing-images") {
    return "Sin imágenes";
  }

  return "Incompleta";
}

export function formatAdminDancerDocument(input: {
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

export function formatAdminDancerBirthDate(value: string) {
  const [year, month, day] = value.split("-");

  return `${day}/${month}/${year}`;
}
