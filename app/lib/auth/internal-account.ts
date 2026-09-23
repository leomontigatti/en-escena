import {
  internalUserRoleLabels,
  type InternalUserRole,
} from "@/lib/auth/internal-user-roles";

/**
 * What an internal user sees of themselves in the account menu: internal users
 * have no email, so their name, their `Permiso principal` and the username they
 * log in with take its place. See docs/domain/access.md.
 */
export type InternalAccount = {
  name: string;
  roleLabel: string;
  username: string;
};

export function buildInternalAccount(appUser: {
  internalUsername: string | null;
  name: string | null;
  role: InternalUserRole;
}): InternalAccount {
  const username = appUser.internalUsername ?? "";

  return {
    name: appUser.name?.trim() || username,
    roleLabel: internalUserRoleLabels[appUser.role],
    username,
  };
}

export function getInternalAccountInitials(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("");

  return (initials || name.slice(0, 2)).toUpperCase();
}
