import type { UserKind, UserRole } from "@/lib/auth/user-role.shared";
import type { UserAccessState } from "@/lib/auth/user-access-state.shared";
import {
  buildCanonicalListSearch,
  type ListQuerySpec,
} from "@/lib/list-query/list-query";

export type UserListType = UserKind;

export type UserListFilters = {
  page: number;
  query: string;
  role: UserRole | "all";
  /** `null` is no state chosen, and the list then shows the active users. */
  state: UserAccessState | null;
  type: UserListType | "all";
};

export type UserListItem = {
  id: string;
  academyName: string | null;
  identifier: string;
  mainRole: UserRole;
  name: string;
  state: UserAccessState;
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
    estado: filters.state,
    rol: filters.role === "all" ? null : filters.role,
    tipo: filters.type === "all" ? null : filters.type,
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
