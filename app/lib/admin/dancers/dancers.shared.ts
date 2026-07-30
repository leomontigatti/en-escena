export const dancerPageSize = 50;
export const dancerNotFoundMessage = "No encontramos ese Bailarín.";

export type DancerParticipationFilter = "yes" | "no" | "all";
export type DancerStatusFilter = "active" | "archived" | "all";
export type DancerNameOrder = "asc" | "desc";
export type DancerIdentificationFilter =
  | "incomplete"
  | "unverified"
  | "verified"
  | "all";
export type DancerIdentificationStatus =
  | "incomplete"
  | "unverified"
  | "verified";
export type DancerAuditAction =
  | "update"
  | "archive"
  | "reactivate"
  | "verify-identity";

export type DancerListFilters = {
  nameOrder: DancerNameOrder;
  participation: DancerParticipationFilter;
  query: string;
  status: DancerStatusFilter;
  identification: DancerIdentificationFilter;
  page: number;
};

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

export function readDancerStatusFilter(
  value: string | null,
): DancerStatusFilter {
  switch (value) {
    case "archivados":
      return "archived";
    case "todos":
      return "all";
    default:
      return "active";
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

/** `all` se codifica por ausencia del parámetro, así que devuelve `null`. */
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

/** `active` se codifica por ausencia del parámetro, así que devuelve `null`. */
export function toDancerStatusSearchValue(value: DancerStatusFilter) {
  switch (value) {
    case "archived":
      return "archivados";
    case "all":
      return "todos";
    default:
      return null;
  }
}

export function toDancerIdentificationSearchValue(
  value: DancerIdentificationFilter,
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
