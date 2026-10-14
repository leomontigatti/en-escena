import type { userRole } from "@/db/schema";

/**
 * A user's main permission —ui: "Permiso principal"—, stored as `role`. This
 * module is the one place that names the permissions, labels them and decides
 * what each may do: guards, loaders and views ask a predicate here instead of
 * comparing a role or listing a set of roles, so a new permission is added
 * here. See the Permission Matrix in docs/domain/access.md.
 *
 * This is the pure half, usable from views and from tests. The request guards
 * built on these predicates live in `internal-access.server.ts`.
 */
export type UserRole = (typeof userRole.enumValues)[number];

const userRoleLabels = {
  admin: "Administrador",
  academy: "Academia",
  auditor: "Auditor",
  judge: "Juez",
} satisfies Record<UserRole, string>;

/** The permissions in the order every select and filter lists them. */
const USER_ROLES = Object.keys(userRoleLabels) as UserRole[];

const userRoleSet = new Set<string>(USER_ROLES);

export function isUserRole(role: string): role is UserRole {
  return userRoleSet.has(role);
}

export const INTERNAL_USER_ROLES = [
  "admin",
  "auditor",
  "judge",
] as const satisfies readonly UserRole[];

/** The permissions held by internal users, who sign in with a username. */
export type InternalUserRole = (typeof INTERNAL_USER_ROLES)[number];

const internalUserRoleSet = new Set<string>(INTERNAL_USER_ROLES);

export function isInternalUserRole(role: string): role is InternalUserRole {
  return internalUserRoleSet.has(role);
}

export function getUserRoleLabel(role: UserRole) {
  return userRoleLabels[role];
}

/** Every permission as select and filter options, labelled from the one table. */
export const userRoleOptions = USER_ROLES.map((value) => ({
  value,
  label: userRoleLabels[value],
}));

/** The permissions an administrator may give an internal user. */
export const internalUserRoleOptions = INTERNAL_USER_ROLES.map((value) => ({
  value,
  label: userRoleLabels[value],
}));

/** Who enters the `Panel de administración`: the administrator and the auditor. */
export function canReadAdminPanel(role: UserRole) {
  return role === "admin" || role === "auditor";
}

/**
 * Who may change anything in administration. The auditor reads and never
 * writes: a view renders no control that changes data when this is false.
 */
export function canWriteInAdminPanel(role: UserRole) {
  return role === "admin";
}

/** The auditor's exports are the auditor's alone for now (PRD #1448). */
export function canDownloadAuditorExports(role: UserRole) {
  return role === "auditor";
}

export function canEnterJudgePanel(role: UserRole) {
  return role === "judge";
}

export function canEnterPortal(role: UserRole) {
  return role === "academy";
}

type LandingPath = "/portal" | "/administracion" | "/juzgamiento";

const landingPaths = {
  academy: "/portal",
  admin: "/administracion",
  // The auditor reads the same panel the administrator works in.
  auditor: "/administracion",
  judge: "/juzgamiento",
} satisfies Record<UserRole, LandingPath>;

/** Where a signed-in user of this permission lands. */
export function getLandingPath(role: UserRole): LandingPath {
  return landingPaths[role];
}
