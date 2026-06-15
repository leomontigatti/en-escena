import { redirect } from "react-router";

import { auth } from "@/lib/auth/auth.server";

import type { Route } from "./+types/salir";

export async function loader() {
  throw redirect("/ingresar");
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw redirect("/ingresar");
  }

  const result = await auth.api.signOut({
    headers: request.headers,
    returnHeaders: true,
  });

  throw redirect("/ingresar?sesion=cerrada", {
    headers: result.headers,
  });
}
