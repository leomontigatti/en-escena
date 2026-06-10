export const INTERNAL_USER_ROLES = ["admin", "auditor", "judge"] as const;

export type InternalUserRole = (typeof INTERNAL_USER_ROLES)[number];
