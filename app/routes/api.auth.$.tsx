import { auth } from "@/lib/auth/access-auth-provider.betterauth.server";

import type { Route } from "./+types/api.auth.$";

// Better Auth's catch-all: it delegates the loader (GET) and the action
// (POST/PUT/...) to `auth.handler`, which resolves every endpoint under
// `/api/auth/*` (sign-in/up, session, password reset, email verification).
// Better Auth's client (`access-auth-client`) hits these routes.
export async function loader({ request }: Route.LoaderArgs) {
  return auth.handler(request);
}

export async function action({ request }: Route.ActionArgs) {
  return auth.handler(request);
}
