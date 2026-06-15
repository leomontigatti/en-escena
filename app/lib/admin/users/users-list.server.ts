import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import {
  INTERNAL_USER_ROLES,
  type InternalUserRole,
} from "@/lib/auth/internal-user-roles";

export type AdministrativeUserListRole = "academy" | InternalUserRole;

export type AdministrativeUserListState =
  | "active"
  | "mandatory-password-change"
  | "suspended";

export type AdministrativeUserListType = "academy" | "internal";

export type AdministrativeUserListFilters = {
  query: string;
  role: AdministrativeUserListRole | "all";
  state: AdministrativeUserListState | "all";
  type: AdministrativeUserListType | "all";
};

export type AdministrativeUserListItem = {
  id: string;
  academyName: string | null;
  identifier: string;
  mainRole: AdministrativeUserListRole;
  name: string;
  state: AdministrativeUserListState;
  userType: AdministrativeUserListType;
};

export function readAdministrativeUserFilters(
  searchParams: URLSearchParams,
): AdministrativeUserListFilters {
  return {
    query: searchParams.get("q")?.trim() ?? "",
    role: readRoleFilter(searchParams.get("permiso")),
    state: readStateFilter(searchParams.get("estado")),
    type: readTypeFilter(searchParams.get("tipo")),
  };
}

export async function listAdministrativeUsers(input: {
  filters: AdministrativeUserListFilters;
}): Promise<AdministrativeUserListItem[]> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      internalUsername: user.internalUsername,
      requiresPasswordChange: user.requiresPasswordChange,
      academyName: academies.name,
      academyContactName: academies.contactName,
    })
    .from(user)
    .leftJoin(academies, eq(academies.userId, user.id))
    .where(buildAdministrativeUserWhere(input.filters))
    .orderBy(
      asc(sql`lower(coalesce(${academies.contactName}, ${user.name}))`),
      asc(sql`lower(coalesce(${user.internalUsername}, ${user.email}))`),
      asc(user.id),
    );

  return rows.map((row) => ({
    id: row.id,
    academyName: row.role === "academy" ? row.academyName : null,
    identifier: row.internalUsername ?? row.email,
    mainRole: row.role,
    name:
      row.role === "academy" ? (row.academyContactName ?? row.name) : row.name,
    state:
      row.role !== "academy" && row.requiresPasswordChange
        ? "mandatory-password-change"
        : "active",
    userType: row.role === "academy" ? "academy" : "internal",
  }));
}

function buildAdministrativeUserWhere(
  filters: AdministrativeUserListFilters,
): SQL<unknown> | undefined {
  const clauses: SQL<unknown>[] = [];

  if (filters.query) {
    const search = `%${filters.query}%`;

    clauses.push(
      or(
        ilike(user.name, search),
        ilike(user.email, search),
        ilike(user.internalUsername, search),
        ilike(academies.contactName, search),
      ) ?? sql`false`,
    );
  }

  if (filters.role !== "all") {
    clauses.push(eq(user.role, filters.role));
  }

  if (filters.type === "academy") {
    clauses.push(eq(user.role, "academy"));
  } else if (filters.type === "internal") {
    clauses.push(inArray(user.role, INTERNAL_USER_ROLES));
  }

  if (filters.state === "active") {
    clauses.push(
      or(eq(user.role, "academy"), eq(user.requiresPasswordChange, false)) ??
        sql`false`,
    );
  } else if (filters.state === "mandatory-password-change") {
    clauses.push(eq(user.requiresPasswordChange, true));
    clauses.push(inArray(user.role, INTERNAL_USER_ROLES));
  } else if (filters.state === "suspended") {
    clauses.push(sql`false`);
  }

  if (clauses.length === 0) {
    return undefined;
  }

  return and(...clauses);
}

function readRoleFilter(
  value: string | null,
): AdministrativeUserListFilters["role"] {
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

function readStateFilter(
  value: string | null,
): AdministrativeUserListFilters["state"] {
  switch (value) {
    case "active":
    case "mandatory-password-change":
    case "suspended":
      return value;
    default:
      return "all";
  }
}

function readTypeFilter(
  value: string | null,
): AdministrativeUserListFilters["type"] {
  switch (value) {
    case "academy":
    case "internal":
      return value;
    default:
      return "all";
  }
}
