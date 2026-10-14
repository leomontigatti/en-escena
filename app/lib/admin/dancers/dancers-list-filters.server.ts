import { and, sql, type SQL } from "drizzle-orm";

import { academies, dancers } from "@/db/schema";
import {
  dancerListSpec,
  readDancerParticipationFilter,
  type DancerListFilters,
} from "@/lib/admin/dancers/dancers.shared";
import { readChoreographyDayFilter } from "@/lib/choreographies/choreography-days.server";
import { readListQuery } from "@/lib/list-query/list-query";
import { rosterPersonSearchCondition } from "@/lib/roster/roster-person-search.server";
import { readRosterPersonStatusFilter } from "@/lib/roster/roster-person-status.shared";
import { rosterPersonStatusCondition } from "@/lib/roster/roster-person-status.server";
import { buildDancerEventParticipationSql } from "@/lib/participation/participation.server";
import { readDancerVerificationFilter } from "@/lib/dancers/verification";
import { buildDancerVerificationStatusSql } from "@/lib/dancers/verification.server";

function readDancerFilters(searchParams: URLSearchParams): DancerListFilters {
  const listQuery = readListQuery(searchParams, dancerListSpec);

  return {
    day: readChoreographyDayFilter(searchParams),
    order: listQuery.order,
    participation: readDancerParticipationFilter(
      searchParams.get("participando"),
    ),
    query: listQuery.search,
    status: readRosterPersonStatusFilter(searchParams),
    verification: readDancerVerificationFilter(
      searchParams.get("verificacion"),
    ),
    page: listQuery.page,
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

  if (input.selectedEventId !== null && input.filters.day !== null) {
    conditions.push(
      sql`${buildDancerEventParticipationSql(input.selectedEventId, input.filters.day)}`,
    );
  }

  if (input.filters.verification !== "all") {
    conditions.push(
      buildDancerVerificationStatusSql(input.filters.verification),
    );
  }

  const searchCondition = rosterPersonSearchCondition(
    input.filters.query,
    dancers,
    [academies.name],
  );

  if (searchCondition) {
    conditions.push(searchCondition);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export { readDancerFilters, buildDancerFilters };
