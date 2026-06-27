export const adminDancerPageSize = 50;
export const adminDancerNotFoundMessage = "No encontramos ese Bailarín.";
export const adminDancerCorrectionReasonMessage =
  "Ingresá un motivo de corrección para guardar este cambio.";

export type AdminDancerParticipationFilter = "yes" | "no" | "all";
export type AdminDancerStatusFilter = "active" | "archived" | "all";
export type AdminDancerNameOrder = "asc" | "desc";
export type AdminDancerIdentificationFilter =
  | "incomplete"
  | "unverified"
  | "verified"
  | "all";
export type AdminDancerParticipationStatus =
  | "participating"
  | "not-participating"
  | "no-event";
export type AdminDancerIdentificationStatus =
  | "incomplete"
  | "unverified"
  | "verified";
export type AdministrativeDancerAuditAction =
  | "update"
  | "archive"
  | "reactivate"
  | "verify-identity";

export type AdministrativeDancerListFilters = {
  nameOrder: AdminDancerNameOrder;
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
      return "all";
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

export function getAdminDancerParticipationBadgeVariant(
  participationStatus: AdminDancerParticipationStatus,
) {
  return participationStatus === "participating" ? "success" : "secondary";
}

export function getAdminDancerIdentificationBadgeVariant(
  identificationStatus: AdminDancerIdentificationStatus,
) {
  if (identificationStatus === "verified") {
    return "success";
  }

  if (identificationStatus === "unverified") {
    return "info";
  }

  return "warning";
}
