import { and, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { academies, dancers } from "@/db/schema";
import {
  readAdminDancerIdentificationFilter,
  readAdminDancerParticipationFilter,
  readAdminDancerStatusFilter,
  type AdministrativeDancerListFilters,
} from "@/lib/admin/dancers/dancers.shared";
import {
  escapeForLike,
  readDancerNameOrder,
  readPage,
} from "@/lib/admin/dancers/dancers.server.shared";
import { buildDancerEventParticipationSql } from "@/lib/people/participation.server";

export function readAdministrativeDancerFilters(
  searchParams: URLSearchParams,
  options: { hasSelectedEvent: boolean },
): AdministrativeDancerListFilters {
  return {
    nameOrder: readDancerNameOrder(searchParams.get("orden")),
    participation: readAdminDancerParticipationFilter({
      value: searchParams.get("participando"),
      hasSelectedEvent: options.hasSelectedEvent,
    }),
    query: searchParams.get("q")?.trim() ?? "",
    status: readAdminDancerStatusFilter(searchParams.get("estado")),
    identification: readAdminDancerIdentificationFilter(
      searchParams.get("identificacion"),
    ),
    page: readPage(searchParams),
  };
}

export function buildAdministrativeDancerWhere(input: {
  selectedEventId: string | null;
  filters: AdministrativeDancerListFilters;
}) {
  const conditions: SQL[] = [];
  const participationSql = buildDancerEventParticipationSql(
    input.selectedEventId,
  );

  if (input.filters.status === "active") {
    conditions.push(eq(dancers.active, true));
  } else if (input.filters.status === "archived") {
    conditions.push(eq(dancers.active, false));
  }

  if (input.selectedEventId !== null && input.filters.participation !== "all") {
    if (input.filters.participation === "yes") {
      conditions.push(sql`${participationSql}`);
    } else {
      conditions.push(sql`not ${participationSql}`);
    }
  }

  if (input.filters.identification === "incomplete") {
    conditions.push(sql`
      (
        ${dancers.documentType} is null
        or ${dancers.documentNumber} is null
        or ${dancers.documentFrontImageStorageKey} is null
        or ${dancers.documentBackImageStorageKey} is null
      )
    `);
  } else if (input.filters.identification === "unverified") {
    conditions.push(sql`
      ${dancers.documentType} is not null
      and ${dancers.documentNumber} is not null
      and ${dancers.documentFrontImageStorageKey} is not null
      and ${dancers.documentBackImageStorageKey} is not null
      and ${dancers.identityVerifiedAt} is null
    `);
  } else if (input.filters.identification === "verified") {
    conditions.push(sql`
      ${dancers.documentType} is not null
      and ${dancers.documentNumber} is not null
      and ${dancers.documentFrontImageStorageKey} is not null
      and ${dancers.documentBackImageStorageKey} is not null
      and ${dancers.identityVerifiedAt} is not null
    `);
  }

  if (input.filters.query.length > 0) {
    const search = `%${escapeForLike(input.filters.query)}%`;
    const searchCondition = or(
      ilike(dancers.firstName, search),
      ilike(dancers.lastName, search),
      ilike(sql`${dancers.firstName} || ' ' || ${dancers.lastName}`, search),
      ilike(sql`${dancers.lastName} || ' ' || ${dancers.firstName}`, search),
      ilike(dancers.documentNumber, search),
      ilike(academies.name, search),
    );

    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}
