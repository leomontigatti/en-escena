import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { INTERNAL_USER_ROLES } from "@/lib/auth/internal-user-roles";
import { userAccessStateCondition } from "@/lib/auth/user-access-state.server";
import {
  readUserAccessStateFilter,
  toUserAccessState,
} from "@/lib/auth/user-access-state.shared";
import { adminListPageSize } from "@/lib/admin/admin-list";
import {
  userListSpec,
  type UserListFilters,
  type UserListItem,
} from "@/lib/admin/users/users-list.shared";
import { paginateList, readListQuery } from "@/lib/list-query/list-query";
import { listSearchCondition } from "@/lib/list-query/list-query.server";

export function readUserFilters(
  searchParams: URLSearchParams,
): UserListFilters {
  const listQuery = readListQuery(searchParams, userListSpec);

  return {
    page: listQuery.page,
    query: listQuery.search,
    role: readRoleFilter(searchParams.get("rol")),
    state: readStateFilter(searchParams),
    type: readTypeFilter(searchParams.get("tipo")),
  };
}

export async function listUsers(input: { filters: UserListFilters }): Promise<{
  filters: UserListFilters;
  items: UserListItem[];
  totalCount: number;
  totalPages: number;
}> {
  const where = buildUserWhere(input.filters);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(user)
    .leftJoin(academies, eq(academies.userId, user.id))
    .where(where);
  const totalCount = Number(count);
  const { limit, offset, page, totalPages } = paginateList({
    page: input.filters.page,
    pageSize: adminListPageSize,
    totalCount,
  });
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      internalUsername: user.internalUsername,
      suspended: user.suspended,
      academyName: academies.name,
      academyContactName: academies.contactName,
    })
    .from(user)
    .leftJoin(academies, eq(academies.userId, user.id))
    .where(where)
    .orderBy(
      asc(sql`lower(coalesce(${academies.contactName}, ${user.name}))`),
      asc(sql`lower(coalesce(${user.internalUsername}, ${user.email}))`),
      asc(user.id),
    )
    .limit(limit)
    .offset(offset);

  const items = rows.map((row) => ({
    id: row.id,
    academyName: row.role === "academy" ? row.academyName : null,
    identifier: row.internalUsername ?? row.email,
    mainRole: row.role,
    name:
      row.role === "academy" ? (row.academyContactName ?? row.name) : row.name,
    state: toUserAccessState(row),
    userType:
      row.role === "academy" ? ("academy" as const) : ("internal" as const),
  }));

  return {
    filters: { ...input.filters, page },
    items,
    totalCount,
    totalPages,
  };
}

function buildUserWhere(filters: UserListFilters): SQL<unknown> | undefined {
  const clauses: SQL<unknown>[] = [];

  // Only an academy is found by email: an internal user's is a made-up
  // credential nobody knows. See docs/domain/access.md.
  const searchCondition = listSearchCondition(filters.query, [
    user.name,
    sql`case when ${user.role} = 'academy' then ${user.email} end`,
    user.internalUsername,
    academies.contactName,
  ]);

  if (searchCondition) {
    clauses.push(searchCondition);
  }

  if (filters.type === "academy") {
    clauses.push(eq(user.role, "academy"));
  } else if (filters.type === "internal") {
    clauses.push(inArray(user.role, INTERNAL_USER_ROLES));
  }

  if (filters.role !== "all") {
    clauses.push(eq(user.role, filters.role));
  }

  clauses.push(userAccessStateCondition(filters.state ?? "active"));

  return and(...clauses);
}

/**
 * `?archivado=si` was a second spelling of `?estado=suspended`. It is read as
 * that state so a saved link lands on the canonical URL instead of breaking.
 */
function readStateFilter(searchParams: URLSearchParams) {
  return (
    readUserAccessStateFilter(searchParams) ??
    (searchParams.get("archivado") === "si" ? "suspended" : null)
  );
}

function readRoleFilter(value: string | null): UserListFilters["role"] {
  switch (value) {
    case "academy":
    case "admin":
    case "auditor":
    case "judge":
      return value;
    default:
      return "all";
  }
}

function readTypeFilter(value: string | null): UserListFilters["type"] {
  switch (value) {
    case "academy":
    case "internal":
      return value;
    default:
      return "all";
  }
}
