import {
  listUsers,
  readUserFilters,
} from "@/lib/admin/users/users-list.server";
import { toUserAppliedListQuery } from "@/lib/admin/users/users-list.shared";
import { requireAdminPanelWriter } from "@/lib/auth/internal-access.server";
import { canWriteInAdminPanel } from "@/lib/auth/user-role.shared";
import { redirectToCanonicalListUrl } from "@/lib/list-query/list-query.server";
import { readRequestedUrl } from "@/lib/shared/requested-url.server";

export async function loader({ request }: { request: Request }) {
  const appUser = await requireAdminPanelWriter(request);
  const filters = readUserFilters(readRequestedUrl(request).searchParams);
  const listResult = await listUsers({ filters });

  redirectToCanonicalListUrl(
    request,
    toUserAppliedListQuery(listResult.filters),
  );

  return {
    canWrite: canWriteInAdminPanel(appUser.role),
    filters: listResult.filters,
    totalCount: listResult.totalCount,
    totalPages: listResult.totalPages,
    users: listResult.items,
  };
}
