import { redirect } from "react-router";

import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import { appendLegacySessionCookieClearHeaders } from "@/lib/auth/legacy-session-cookies.server";

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
  throw redirect("/ingresar?sesion=cerrada", {
    headers: appendLegacySessionCookieClearHeaders(result.headers, request),
  });
}
