import {
  listAdministrativeUsers,
  readAdministrativeUserFilters,
} from "@/lib/admin/users/users-list.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

export async function loader({ request }: { request: Request }) {
  const appUser = await requireInternalUser(request, ["admin", "auditor"]);
  const filters = readAdministrativeUserFilters(
    new URL(request.url).searchParams,
  );
  const users = await listAdministrativeUsers({ filters });

  return {
    canManage: appUser.role === "admin",
    filters,
    users,
  };
}
