export const INTERNAL_USER_ROLES = ["admin", "auditor", "judge"] as const;

export type InternalUserRole = (typeof INTERNAL_USER_ROLES)[number];

/** The `Permiso principal` label of each internal role, for every surface. */
export const internalUserRoleLabels = {
  admin: "Administrador",
  auditor: "Auditor",
  judge: "Juez",
} satisfies Record<InternalUserRole, string>;

const internalUserRoleSet = new Set<string>(INTERNAL_USER_ROLES);

export function isInternalUserRole(role: string): role is InternalUserRole {
  return internalUserRoleSet.has(role);
}
