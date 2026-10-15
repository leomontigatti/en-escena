import { and, asc, eq, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { individuals } from "@/db/schema";
import { adminListPageSize } from "@/lib/admin/admin-list";
import { requireAdminPanelReader } from "@/lib/auth/internal-access.server";
import { canWriteInAdminPanel } from "@/lib/auth/user-role.shared";
import { isIndividualLinkState } from "@/lib/individuals/link-state";
import { individualLinkStateSql } from "@/lib/individuals/link.server";
import {
  paginateList,
  readListFacet,
  readListQuery,
} from "@/lib/list-query/list-query";
import { redirectToCanonicalListUrl } from "@/lib/list-query/list-query.server";
import { rosterPersonSearchCondition } from "@/lib/roster/roster-person-search.server";
import { readRequestedUrl } from "@/lib/shared/requested-url.server";

import {
  individualListSpec,
  toIndividualAppliedListQuery,
  type IndividualListFilters,
  type IndividualListItem,
} from "../shared";

/** Administration writes; the auditor reads it all and confirms nothing. */
export async function loadIndividualsList(request: Request) {
  const user = await requireAdminPanelReader(request);
  const filters = readIndividualFilters(readRequestedUrl(request).searchParams);
  const listResult = await listIndividuals(filters);

  redirectToCanonicalListUrl(
    request,
    toIndividualAppliedListQuery(listResult.filters),
  );

  return {
    canWrite: canWriteInAdminPanel(user.role),
    filters: listResult.filters,
    individuals: listResult.items,
    totalCount: listResult.totalCount,
    totalPages: listResult.totalPages,
  };
}

function readIndividualFilters(
  searchParams: URLSearchParams,
): IndividualListFilters {
  const listQuery = readListQuery(searchParams, individualListSpec);
  const linkState = readListFacet(searchParams, "vinculo");

  return {
    linkState:
      linkState !== null && isIndividualLinkState(linkState) ? linkState : null,
    page: listQuery.page,
    query: listQuery.search,
  };
}

async function listIndividuals(filters: IndividualListFilters): Promise<{
  filters: IndividualListFilters;
  items: IndividualListItem[];
  totalCount: number;
  totalPages: number;
}> {
  const where = buildIndividualWhere(filters);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(individuals)
    .where(where);
  const totalCount = Number(count);
  const { limit, offset, page, totalPages } = paginateList({
    page: filters.page,
    pageSize: adminListPageSize,
    totalCount,
  });
  const items = await db
    .select({
      documentNumber: individuals.documentNumber,
      documentType: individuals.documentType,
      firstName: individuals.firstName,
      id: individuals.id,
      lastName: individuals.lastName,
      linkState: individualLinkStateSql(),
    })
    .from(individuals)
    .where(where)
    .orderBy(
      asc(sql`lower(${individuals.lastName})`),
      asc(sql`lower(${individuals.firstName})`),
      asc(individuals.id),
    )
    .limit(limit)
    .offset(offset);

  return {
    filters: { ...filters, page },
    items,
    totalCount,
    totalPages,
  };
}

function buildIndividualWhere(filters: IndividualListFilters) {
  const clauses: SQL[] = [];
  const searchCondition = rosterPersonSearchCondition(filters.query, {
    documentNumber: individuals.documentNumber,
    firstName: individuals.firstName,
    lastName: individuals.lastName,
  });

  if (searchCondition) {
    clauses.push(searchCondition);
  }

  if (filters.linkState !== null) {
    clauses.push(eq(individualLinkStateSql(), filters.linkState));
  }

  return and(...clauses);
}
