import type { InternalUserRole } from "@/lib/auth/internal-user-roles";
import {
  buildCanonicalListSearch,
  type ListQuerySpec,
} from "@/lib/list-query/list-query";

export type UserListRole = "academy" | InternalUserRole;

export type UserListState =
  "active" | "mandatory-password-change" | "suspended";

export type UserListStateFilter =
  "active" | "mandatory-password-change" | "suspended";

export type UserListType = "academy" | "internal";

export type UserListFilters = {
  archived: boolean;
  page: number;
  query: string;
  role: UserListRole | "all";
  state: UserListStateFilter | "all";
  type: UserListType | "all";
};

export type UserListItem = {
  id: string;
  academyName: string | null;
  identifier: string;
  mainRole: UserListRole;
  name: string;
  state: UserListState;
  userType: UserListType;
};

/**
 * The user list has one order —by name— and no sortable column, so an `orden`
 * in its URL is only ever dropped.
 */
export const userListSpec: ListQuerySpec<"nombre"> = {
  orderColumnIds: ["nombre"],
  defaultOrder: { columnId: "nombre", direction: "asc" },
};

/** The list's facets as the URL writes them, each absent at its default. */
export function toUserListFacets(filters: UserListFilters) {
  return {
    estado: filters.state === "all" ? null : filters.state,
    rol: filters.role === "all" ? null : filters.role,
    tipo: filters.type === "all" ? null : filters.type,
    archivado: filters.archived ? "si" : null,
  };
}

/** What the list applied, as its canonical address is written from it. */
export function toUserAppliedListQuery(filters: UserListFilters) {
  return {
    facets: toUserListFacets(filters),
    query: {
      order: userListSpec.defaultOrder,
      page: filters.page,
      search: filters.query,
    },
    spec: userListSpec,
  };
}

/** The list's canonical query string, carried to a detail screen and back. */
export function buildUserListSearch(filters: UserListFilters) {
  return buildCanonicalListSearch({
    ...toUserAppliedListQuery(filters),
    currentSearch: "",
  });
}
