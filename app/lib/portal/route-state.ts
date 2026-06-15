export type PortalRecordStatusFilter = "active" | "archived";

const archivedStatusSearchValue = "archivados";

export function readPortalRecordStatusFilter(
  searchParams: URLSearchParams,
): PortalRecordStatusFilter {
  return searchParams.get("estado") === archivedStatusSearchValue
    ? "archived"
    : "active";
}

export function resolvePortalRecordStatusFilter(
  request: Request,
  isActive: boolean,
): PortalRecordStatusFilter {
  const requestedFilter = readPortalRecordStatusFilter(
    new URL(request.url).searchParams,
  );

  return !isActive && requestedFilter === "active"
    ? "archived"
    : requestedFilter;
}

export function getPortalRecordStatusSearch(
  statusFilter: PortalRecordStatusFilter,
) {
  return statusFilter === "archived"
    ? `?estado=${archivedStatusSearchValue}`
    : "";
}

export function getPortalEventStatusLabel(isReadOnly: boolean) {
  return isReadOnly ? "Sin Evento activo" : "Evento activo";
}
