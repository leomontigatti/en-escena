import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth.server";

export async function requireAdminUser(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    throw redirect("/ingresar");
  }

  const appUser = await db.query.user.findFirst({
    columns: { id: true, email: true, role: true },
    where: eq(user.id, session.user.id),
  });

  if (!appUser || appUser.role !== "admin") {
    throw new Response("No tenés permiso para invitar usuarios internos.", {
      status: 403,
    });
  }

  return appUser;
}
