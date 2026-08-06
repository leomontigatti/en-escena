import { redirect } from "react-router";

import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import { createLegacySessionCookieClearHeaders } from "@/lib/auth/legacy-session-cookies.server";
import { getSetCookieValues } from "@/lib/auth/set-cookie-headers";

import type { Route } from "./+types/salir";

export async function loader() {
  throw redirect("/ingresar");
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw redirect("/ingresar");
  }

  const result = await accessAuthProvider.signOutCurrentSession(request);

  // Al cerrar sesión también se expira toda cookie `sb-*` previa al cutover,
  // para no dejar una sesión parcial en el navegador (#582).
  for (const value of getSetCookieValues(
    createLegacySessionCookieClearHeaders(request),
  )) {
    result.headers.append("set-cookie", value);
  }

  throw redirect("/ingresar?sesion=cerrada", { headers: result.headers });
}
