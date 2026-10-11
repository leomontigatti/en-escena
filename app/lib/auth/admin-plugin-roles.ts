import { adminAc, defaultAc } from "better-auth/plugins/admin/access";

import type { userRole } from "@/db/schema";

// The admin plugin's roles, shared by the server plugin and `adminClient` so
// both answer the same. `admin` is the plugin's own admin role minus
// impersonation: 1.7 made it work, and nothing in the app accounts for a
// session opened as someone else (#984). Derived from upstream so it follows
// what a later release adds. The other roles get no plugin permission, as
// before; they are listed because a `roles` map also bounds the roles the
// plugin may assign.
const IMPERSONATION_PERMISSIONS: readonly string[] = [
  "impersonate",
  "impersonate-admins",
];

export const ADMIN_PLUGIN_ROLES = {
  admin: defaultAc.newRole({
    ...adminAc.statements,
    user: adminAc.statements.user.filter(
      (permission) => !IMPERSONATION_PERMISSIONS.includes(permission),
    ),
  }),
  academy: defaultAc.newRole({ user: [], session: [] }),
  auditor: defaultAc.newRole({ user: [], session: [] }),
  judge: defaultAc.newRole({ user: [], session: [] }),
} satisfies Record<(typeof userRole.enumValues)[number], unknown>;
