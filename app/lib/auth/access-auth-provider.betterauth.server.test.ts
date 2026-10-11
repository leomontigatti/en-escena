import { describe, expect, test } from "vitest";

import { createBetterAuthAccessAuthProvider } from "@/lib/auth/access-auth-provider.betterauth.server";
import { RecoveryLinkRefusedError } from "@/lib/auth/access-auth-provider.shared.server";

const provider = createBetterAuthAccessAuthProvider();

// Refused from the request's cookies alone: a change that reached the database
// would throw a different error here, where none is configured.
describe("Better Auth AccessAuthProvider adapter", () => {
  test("refuses a password change with no recovery session", async () => {
    await expect(
      provider.updatePasswordForRecovery({
        newPassword: "password-nueva",
        request: new Request("http://localhost/cambiar-contrasena"),
      }),
    ).rejects.toBeInstanceOf(RecoveryLinkRefusedError);
  });
});
