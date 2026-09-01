import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Better Auth's React client. It hits the `/api/auth/*` catch-all on the same
// origin (which is why it does not set `baseURL`). The `adminClient` enables the
// internal-user operations (create/ban/delete users, reset password) that are
// re-pointed in #423.
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [adminClient()],
});
