import { redirect } from "react-router";

import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import { withSupabaseSsrHeaders } from "@/lib/auth/supabase-auth-ssr.server";

import type { Route } from "./+types/salir";

export async function loader() {
  throw redirect("/ingresar");
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw redirect("/ingresar");
  }

  const result = await accessAuthProvider.signOutCurrentSession(request);

  throw redirect(
    "/ingresar?sesion=cerrada",
    withSupabaseSsrHeaders({ headers: result.headers }),
  );
}
