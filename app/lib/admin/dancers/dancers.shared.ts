import type { RosterPersonStatusFilter } from "@/lib/roster/roster-person-status.shared";

export const dancerPageSize = 50;
export const dancerNotFoundMessage = "No encontramos ese Bailarín.";

export type DancerParticipationFilter = "yes" | "no" | "all";
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

export type DancerListFilters = {
  nameOrder: DancerNameOrder;
  participation: DancerParticipationFilter;
  query: string;
  status: RosterPersonStatusFilter;
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
