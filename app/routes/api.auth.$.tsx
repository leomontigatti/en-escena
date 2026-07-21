import { auth } from "@/lib/auth/access-auth-provider.betterauth.server";

import type { Route } from "./+types/api.auth.$";

// Catch-all de Better Auth: delega loader (GET) y action (POST/PUT/...) en
// `auth.handler`, que resuelve todos los endpoints bajo `/api/auth/*`
// (sign-in/up, sesión, reset de contraseña, verificación de email). El client
// de Better Auth (`access-auth-client`) golpea estas rutas.
export async function loader({ request }: Route.LoaderArgs) {
  return auth.handler(request);
}

export async function action({ request }: Route.ActionArgs) {
  return auth.handler(request);
}
