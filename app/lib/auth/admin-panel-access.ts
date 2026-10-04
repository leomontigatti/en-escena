import type { InternalUserRole } from "@/lib/auth/internal-user-roles";

/**
 * Who enters the `Panel de administración`, and who may change anything in it.
 * The auditor reads and never writes: a view renders no control that changes
 * data when `canWrite` is false. The permission vocabulary is not refactored
 * here (#740); this is the one reader set and the one write flag.
 */

export const adminPanelReaderRoles = [
  "admin",
  "auditor",
] as const satisfies readonly InternalUserRole[];

export function canWriteInAdminPanel(role: InternalUserRole) {
  return role === "admin";
}
