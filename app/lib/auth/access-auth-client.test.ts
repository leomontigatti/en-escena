import { describe, expect, test } from "vitest";

import { authClient } from "@/lib/auth/access-auth-client";

// The client answers from its own copy of the roles; without the server's, it
// falls back to the plugin's default admin, which may impersonate (#984).
describe("auth client role permissions", () => {
  test("agrees with the server that an admin may suspend but not impersonate", () => {
    expect(
      authClient.admin.checkRolePermission({
        role: "admin",
        permissions: { user: ["ban"] },
      }),
    ).toBe(true);
    expect(
      authClient.admin.checkRolePermission({
        role: "admin",
        permissions: { user: ["impersonate"] },
      }),
    ).toBe(false);
  });
});
