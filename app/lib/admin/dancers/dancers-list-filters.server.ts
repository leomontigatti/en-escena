import { and, ilike, or, sql, type SQL } from "drizzle-orm";

import { academies, dancers } from "@/db/schema";
import {
  readDancerIdentificationFilter,
  readDancerParticipationFilter,
  type DancerListFilters,
} from "@/lib/admin/dancers/dancers.shared";
import { readRosterPersonStatusFilter } from "@/lib/roster/roster-person-status.shared";
import { rosterPersonStatusCondition } from "@/lib/roster/roster-person-status.server";
import {
  escapeForLike,
  readDancerNameOrder,
  readPage,
} from "@/lib/admin/dancers/dancers.server.shared";
import { buildDancerEventParticipationSql } from "@/lib/participation/participation.server";

function readDancerFilters(searchParams: URLSearchParams): DancerListFilters {
  return {
    nameOrder: readDancerNameOrder(searchParams.get("orden")),
    participation: readDancerParticipationFilter(
      searchParams.get("participando"),
    ),
    query: searchParams.get("busqueda")?.trim() ?? "",
    status: readRosterPersonStatusFilter(searchParams),
    identification: readDancerIdentificationFilter(
      searchParams.get("identificacion"),
    ),
    page: readPage(searchParams),
  };
}

function buildDancerFilters(input: {
  selectedEventId: string | null;
  filters: DancerListFilters;
}) {
  const conditions: SQL[] = [];
  const participationSql = buildDancerEventParticipationSql(
    input.selectedEventId,
  );

  const statusCondition = rosterPersonStatusCondition(
    dancers,
    input.filters.status,
  );

  if (statusCondition) {
    conditions.push(statusCondition);
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

export { readDancerFilters, buildDancerFilters };
