export const internalInvitationRoles = ["admin", "auditor", "judge"] as const;

export type InternalInvitationRole = (typeof internalInvitationRoles)[number];

export const internalInvitationRoleLabels = {
  admin: "Administración",
  auditor: "Auditoría",
  judge: "Juzgamiento",
} satisfies Record<InternalInvitationRole, string>;

const internalInvitationRoleSet = new Set<string>(internalInvitationRoles);

export function isInternalInvitationRole(
  role: string,
): role is InternalInvitationRole {
  return internalInvitationRoleSet.has(role);
}
