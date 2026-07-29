import {
  listUsers,
  readUserFilters,
} from "@/lib/admin/users/users-list.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

export async function loader({ request }: { request: Request }) {
  const appUser = await requireInternalUser(request, ["admin", "auditor"]);
  const filters = readUserFilters(new URL(request.url).searchParams);
  const users = await listUsers({ filters });

  return {
    canManage: appUser.role === "admin",
    filters,
    users,
  };
}
