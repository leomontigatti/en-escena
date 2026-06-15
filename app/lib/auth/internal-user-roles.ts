export const INTERNAL_USER_ROLES = ["admin", "auditor", "judge"] as const;

export type InternalUserRole = (typeof INTERNAL_USER_ROLES)[number];

const internalUserRoleSet = new Set<string>(INTERNAL_USER_ROLES);

export function isInternalUserRole(role: string): role is InternalUserRole {
  return internalUserRoleSet.has(role);
}
