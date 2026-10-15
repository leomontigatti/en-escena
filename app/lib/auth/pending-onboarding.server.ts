import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import { redirectToLoginForRequest } from "@/lib/auth/access-redirects.server";
import { getLandingPath, isEmailSignUpRole } from "@/lib/auth/user-role.shared";

/**
 * A confirmed identity that holds no account yet, so it may still choose
 * `Academia` or `Particular`. Email confirmation creates the user with the
 * default `academy` permission, so such a user is admitted until it owns an
 * owner row; one that owns it goes to its own area, and an internal user to
 * sign in.
 */
export async function requirePendingOnboardingUser(request: Request) {
  const identity = await accessAuthProvider.getVerifiedAccessIdentity(request);

  if (!identity) {
    redirectToLoginForRequest(request);
  }

  const existingUser = await db.query.user.findFirst({
    columns: { id: true, role: true },
    where: eq(user.id, identity.user.id),
  });

  if (existingUser && !isEmailSignUpRole(existingUser.role)) {
    throw redirect("/ingresar");
  }

  const owner = await db.query.academies.findFirst({
    columns: { id: true },
    where: eq(academies.userId, identity.user.id),
  });

  if (owner) {
    throw redirect(getLandingPath(existingUser?.role ?? "academy"));
  }

  return {
    existingUser,
    headers: identity.headers,
    user: identity.user,
  };
}
