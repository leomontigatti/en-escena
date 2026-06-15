export const adminDancerPageSize = 50;
export const adminDancerNotFoundMessage = "No encontramos ese Bailarín.";
export const adminDancerSavedSearchParam = "guardado";
export const adminDancerSavedSuccessMessage =
  "Bailarín actualizado correctamente.";
export const adminDancerCorrectionReasonMessage =
  "Ingresá un motivo de corrección para guardar este cambio.";

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
export type AdministrativeDancerAuditAction =
  | "update"
  | "archive"
  | "reactivate";

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
  switch (input.value) {
    case "si":
      return "yes";
    case "no":
      return "no";
    case "todos":
      return "all";
    default:
      return input.hasSelectedEvent ? "yes" : "all";
  }
}

export function readAdminDancerStatusFilter(
  value: string | null,
): AdminDancerStatusFilter {
  switch (value) {
    case "archivados":
      return "archived";
    case "todos":
      return "all";
    default:
      return "active";
  }
}

export function readAdminDancerIdentificationFilter(
  value: string | null,
): AdminDancerIdentificationFilter {
  switch (value) {
    case "sin-imagenes":
      return "missing-images";
    case "todos":
      return "all";
    default:
      return "all";
  }
}

export function toAdminDancerParticipationSearchValue(
  value: AdminDancerParticipationFilter,
) {
  switch (value) {
    case "no":
      return "no";
    case "all":
      return "todos";
    default:
      return "si";
  }
}

export function toAdminDancerStatusSearchValue(value: AdminDancerStatusFilter) {
  switch (value) {
    case "archived":
      return "archivados";
    case "all":
      return "todos";
    default:
      return "activos";
  }
}

export function toAdminDancerIdentificationSearchValue(
  value: AdminDancerIdentificationFilter,
) {
  switch (value) {
    case "missing-images":
      return "sin-imagenes";
    case "all":
      return "todos";
    default:
      return "incompleta";
  }
}

export function getAdminDancerParticipationLabel(
  participationStatus: AdminDancerParticipationStatus,
) {
  switch (participationStatus) {
    case "participating":
      return "Participando";
    case "not-participating":
      return "No participando";
    default:
      return "Sin evento";
  }
}

export function getAdminDancerParticipationSummary(
  participationStatus: AdminDancerParticipationStatus,
) {
  switch (participationStatus) {
    case "participating":
      return "Participando en el Evento activo.";
    case "not-participating":
      return "No participa en el Evento activo.";
    default:
      return "Sin Evento activo seleccionado.";
  }
}

export function getAdminDancerIdentificationLabel(
  identificationStatus: AdminDancerIdentificationStatus,
) {
  switch (identificationStatus) {
    case "missing-images":
      return "Sin imágenes";
    default:
      return "Incompleta";
  }
}

export function formatAdminDancerDocument(input: {
  documentType: "dni" | "passport" | "other" | null;
  documentNumber: string | null;
}) {
  if (!input.documentType || !input.documentNumber) {
    return "Sin documento cargado";
  }

  switch (input.documentType) {
    case "dni":
      return `DNI ${input.documentNumber}`;
    case "passport":
      return `Pasaporte ${input.documentNumber}`;
    default:
      return `Otro ${input.documentNumber}`;
  }
}

export function getAdminDancerParticipationBadgeVariant(
  participationStatus: AdminDancerParticipationStatus,
) {
  return participationStatus === "participating" ? "outline" : "secondary";
}

export function getAdminDancerIdentificationBadgeVariant(
  identificationStatus: AdminDancerIdentificationStatus,
) {
  return identificationStatus === "missing-images" ? "outline" : "secondary";
}

export function formatAdminDancerBirthDate(value: string) {
  const [year, month, day] = value.split("-");

  return `${day}/${month}/${year}`;
}
