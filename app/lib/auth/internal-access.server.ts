import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies, accessSession, individuals, user } from "@/db/schema";
import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import { redirectToLoginForRequest } from "@/lib/auth/access-redirects.server";
import { PUBLIC_ONBOARDING_PATH } from "@/lib/auth/access-paths.shared";
import { toUserAccessState } from "@/lib/auth/user-access-state.shared";
import {
  canDownloadAuditorExports,
  canEnterIndividualArea,
  canEnterJudgePanel,
  canEnterPortal,
  canReadAdminPanel,
  canWriteInAdminPanel,
  isInternalUserRole,
  type InternalUserRole,
  type UserRole,
} from "@/lib/auth/user-role.shared";

export type AppUser = {
  id: string;
  email: string;
  internalUsername: string | null;
  name: string | null;
  role: UserRole;
  sessionInvalidBefore: Date | null;
};

export type SignedInAccessState =
  | {
      kind: "app-user";
      user: AppUser;
    }
  | {
      kind: "academy-onboarding";
      user: {
        email: string;
        id: string;
      };
    };

const DEFAULT_FORBIDDEN_MESSAGE = "No tenés permiso para acceder a esta vista.";

export async function requireSignedInAccessState(
  request: Request,
): Promise<SignedInAccessState> {
  const session = await accessAuthProvider.getAccessSession(request);

  if (!session) {
    redirectToLoginForRequest(request);
  }

  const appUser = await db.query.user.findFirst({
    columns: {
      id: true,
      email: true,
      internalUsername: true,
      name: true,
      role: true,
      sessionInvalidBefore: true,
      suspended: true,
    },
    where: eq(user.id, session.user.id),
  });

  if (appUser) {
    if (toUserAccessState(appUser) === "suspended") {
      await revokeAppUserSessionsAndRedirect(request, appUser.id);
    }

    if (
      appUser.sessionInvalidBefore &&
      session.session.issuedAt &&
      session.session.issuedAt < appUser.sessionInvalidBefore
    ) {
      await revokeAppUserSessionsAndRedirect(request, appUser.id);
    }

    return {
      kind: "app-user",
      user: appUser satisfies AppUser,
    };
  }

  const verifiedIdentity =
    await accessAuthProvider.getVerifiedAccessIdentity(request);

  if (
    verifiedIdentity &&
    verifiedIdentity.user.id === session.user.id &&
    verifiedIdentity.user.email === session.user.email
  ) {
    return {
      kind: "academy-onboarding",
      user: verifiedIdentity.user,
    };
  }

  redirectToLoginForRequest(request);
}

export async function requireSignedInUser(request: Request) {
  const accessState = await requireSignedInAccessState(request);

  if (accessState.kind === "academy-onboarding") {
    throw redirect(PUBLIC_ONBOARDING_PATH);
  }

  return accessState.user;
}

export async function requireAcademyUser(request: Request) {
  const appUser = await requireSignedInUser(request);

  if (!canEnterPortal(appUser.role)) {
    throwForbidden("El Portal de academias es solo para academias.");
  }

  const academy = await db.query.academies.findFirst({
    columns: {
      id: true,
      userId: true,
      name: true,
      contactName: true,
      phone: true,
      city: true,
      province: true,
    },
    where: eq(academies.userId, appUser.id),
  });

  if (!academy) {
    throw redirect(PUBLIC_ONBOARDING_PATH);
  }

  return { user: appUser, academy };
}

/**
 * The guard of the individual's own area (ADR-0019): a `Particular` with its
 * person, which it returns with the phone its owner row holds. An academy or
 * an internal user is refused; an individual user without its person (which
 * onboarding never leaves) goes back to onboarding.
 */
export async function requireIndividualUser(request: Request) {
  const appUser = await requireSignedInUser(request);

  if (!canEnterIndividualArea(appUser.role)) {
    throwForbidden("Esta sección es solo para cuentas de particular.");
  }

  const [individual] = await db
    .select({
      id: individuals.id,
      ownerId: academies.id,
      firstName: individuals.firstName,
      lastName: individuals.lastName,
      documentType: individuals.documentType,
      documentNumber: individuals.documentNumber,
      documentPhotoStorageKey: individuals.documentPhotoStorageKey,
      linkConfirmedDocumentNumber: individuals.linkConfirmedDocumentNumber,
      phone: academies.phone,
    })
    .from(academies)
    .innerJoin(individuals, eq(individuals.academyId, academies.id))
    .where(eq(academies.userId, appUser.id))
    .limit(1);

  if (!individual) {
    throw redirect(PUBLIC_ONBOARDING_PATH);
  }

  return { user: appUser, individual };
}

/**
 * The internal-user guards. Each admits the permissions one predicate of
 * `user-role.shared.ts` names, so no guard restates a set of roles.
 */
export async function requireAdminPanelReader(request: Request) {
  return await requireInternalUser(request, canReadAdminPanel);
}

/** Every administration write, and the reads not reviewed for the auditor. */
export async function requireAdminPanelWriter(request: Request) {
  return await requireInternalUser(request, canWriteInAdminPanel);
}

export async function requireAuditorExportReader(request: Request) {
  return await requireInternalUser(request, canDownloadAuditorExports);
}

export async function requireJudgePanelUser(request: Request) {
  return await requireInternalUser(request, canEnterJudgePanel);
}

async function requireInternalUser(
  request: Request,
  isAllowed: (role: InternalUserRole) => boolean,
) {
  const appUser = await requireSignedInUser(request);

  if (!isInternalUserRole(appUser.role) || !isAllowed(appUser.role)) {
    throwForbidden();
  }

  // The guard above narrows the role, and the account menu needs it narrowed.
  return { ...appUser, role: appUser.role };
}

function throwForbidden(message = DEFAULT_FORBIDDEN_MESSAGE): never {
  throw new Response(message, { status: 403 });
}

async function revokeAppUserSessionsAndRedirect(
  request: Request,
  userId: string,
): Promise<never> {
  await accessAuthProvider.signOutCurrentSession(request);
  await db.delete(accessSession).where(eq(accessSession.userId, userId));
  redirectToLoginForRequest(request);
}
