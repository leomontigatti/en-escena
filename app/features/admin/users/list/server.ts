import {
  listUsers,
  readUserFilters,
} from "@/lib/admin/users/users-list.server";
import {
  toUserListFacets,
  userListSpec,
} from "@/lib/admin/users/users-list.shared";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { redirectToCanonicalListUrl } from "@/lib/list-query/list-query.server";

export async function loader({ request }: { request: Request }) {
  const appUser = await requireInternalUser(request, ["admin", "auditor"]);
  const filters = readUserFilters(new URL(request.url).searchParams);
  const listResult = await listUsers({ filters });

  redirectToCanonicalListUrl(request, {
    facets: toUserListFacets(listResult.filters),
    query: {
      order: userListSpec.defaultOrder,
      page: listResult.filters.page,
      search: listResult.filters.query,
    },
    spec: userListSpec,
  });

  return {
    canManage: appUser.role === "admin",
    filters: listResult.filters,
    totalCount: listResult.totalCount,
    totalPages: listResult.totalPages,
    users: listResult.items,
  };
}
