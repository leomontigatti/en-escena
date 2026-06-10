import { redirect } from "react-router";

import { auth } from "@/lib/auth.server";

export async function loader() {
  throw redirect("/ingresar");
}

export async function action({
  request,
}: {
  request: Request;
  [key: string]: unknown;
}) {
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
