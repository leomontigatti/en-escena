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

export type AdministrativeUserListStateFilter =
  | "active"
  | "mandatory-password-change"
  | "suspended";

export type AdministrativeUserListType = "academy" | "internal";

export type AdministrativeUserListFilters = {
  archived: boolean;
  query: string;
  role: AdministrativeUserListRole | "all";
  state: AdministrativeUserListStateFilter | "all";
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
  const stateValue = searchParams.get("estado");

  return {
    archived: readArchivedFilter(searchParams.get("archivado")),
    query: searchParams.get("busqueda")?.trim() ?? "",
    role: readRoleFilter(searchParams.get("rol")),
    state: readStateFilter(stateValue),
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
      suspended: user.suspended,
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
    state: getAdministrativeUserListState(row),
    userType: row.role === "academy" ? "academy" : "internal",
  }));
}

function getAdministrativeUserListState(row: {
  requiresPasswordChange: boolean;
  role: AdministrativeUserListRole;
  suspended: boolean;
}): AdministrativeUserListState {
  if (row.role === "academy") {
    return "active";
  }

  if (row.suspended) {
    return "suspended";
  }

  if (row.requiresPasswordChange) {
    return "mandatory-password-change";
  }

  return "active";
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

  if (filters.type === "academy") {
    clauses.push(eq(user.role, "academy"));
  } else if (filters.type === "internal") {
    clauses.push(inArray(user.role, INTERNAL_USER_ROLES));
  }

  if (filters.role !== "all") {
    clauses.push(eq(user.role, filters.role));
  }

  if (filters.archived) {
    clauses.push(eq(user.suspended, true));
    clauses.push(inArray(user.role, INTERNAL_USER_ROLES));
  } else if (filters.state !== "suspended") {
    clauses.push(
      or(eq(user.role, "academy"), eq(user.suspended, false)) ?? sql`false`,
    );
  }

  if (filters.state === "active") {
    clauses.push(
      or(
        eq(user.role, "academy"),
        and(eq(user.suspended, false), eq(user.requiresPasswordChange, false)),
      ) ?? sql`false`,
    );
  } else if (filters.state === "mandatory-password-change") {
    clauses.push(eq(user.requiresPasswordChange, true));
    clauses.push(eq(user.suspended, false));
    clauses.push(inArray(user.role, INTERNAL_USER_ROLES));
  } else if (filters.state === "suspended") {
    clauses.push(eq(user.suspended, true));
    clauses.push(inArray(user.role, INTERNAL_USER_ROLES));
  }

  if (clauses.length === 0) {
    return undefined;
  }

  return and(...clauses);
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

function readArchivedFilter(value: string | null) {
  return value === "si";
}
