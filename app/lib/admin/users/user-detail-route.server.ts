import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { resetInternalUserPassword } from "@/lib/admin/users/internal-user-password-reset.server";
import { setInternalUserSuspendedState } from "@/lib/admin/users/internal-user-suspension.server";
import {
  buildBackToListHref,
  buildDetailActionError,
  buildDetailUser,
  buildModeHref,
  buildNotificationDetailHref,
  getResetPasswordFieldErrors,
  getUpdateInternalUserFieldErrors,
  getUpdateInternalUserServerFieldErrors,
  readResetPasswordFormValues,
  readUpdateInternalUserFormValues,
  resetPasswordIntent,
  resetPasswordSchema,
  updateInternalUserSchema,
  userStatusIntentSchema,
  type DetailActionData,
  type DetailUserRow,
  type UserDetailLoaderData,
} from "@/lib/admin/users/user-detail.shared";
import { updateInternalUser } from "@/lib/admin/users/internal-user-update.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";

type LoaderArgs = {
  request: Request;
  params: {
    userId?: string;
  };
};

type ActionArgs = LoaderArgs;

const userNotFoundMessage = "Usuario no encontrado.";

export async function loader({
  request,
  params,
}: LoaderArgs): Promise<UserDetailLoaderData> {
  const appUser = await requireInternalUser(request, ["admin", "auditor"]);
  const userId = requireUserId(params.userId);
  const savedUser = await findDetailUserRow(userId);

  if (!savedUser) {
    throw new Response(userNotFoundMessage, { status: 404 });
  }

  const url = new URL(request.url);

  return {
    backToList: buildBackToListHref(request.url),
    canManage: appUser.role === "admin",
    cancelHref: buildModeHref(url, userId, null),
    editHref: buildModeHref(url, userId, "editar"),
    isEditing:
      appUser.role === "admin" && url.searchParams.get("modo") === "editar",
    isResettingPassword:
      appUser.role === "admin" &&
      url.searchParams.get("modo") === "restablecer-contrasena",
    resetPasswordHref: buildModeHref(url, userId, "restablecer-contrasena"),
    user: buildDetailUser(savedUser),
  };
}

export async function action({
  request,
  params,
}: ActionArgs): Promise<DetailActionData | never> {
  const appUser = await requireAdminUser(request);
  await requireAdminPanelUser(request);
  const userId = requireUserId(params.userId);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const parsedIntent = userStatusIntentSchema.safeParse(intent);

  if (parsedIntent.success) {
    const result = await setInternalUserSuspendedState({
      action: parsedIntent.data === "suspend-user" ? "suspend" : "reactivate",
      targetUserId: userId,
      updatedByUserId: appUser.id,
    });

    if (!result.ok) {
      return buildDetailActionError({
        form: "status",
        message: result.error,
      });
    }

    throw redirect(
      buildNotificationDetailHref(
        request.url,
        userId,
        parsedIntent.data === "suspend-user"
          ? "usuario-interno-suspendido"
          : "usuario-interno-reactivado",
      ),
    );
  }

  if (intent === resetPasswordIntent) {
    const values = readResetPasswordFormValues(formData);
    const parsedResetPassword = resetPasswordSchema.safeParse(values);

    if (!parsedResetPassword.success) {
      return buildDetailActionError({
        form: "reset-password",
        message: "Revisá la contraseña temporal.",
        resetPasswordFieldErrors: getResetPasswordFieldErrors(
          parsedResetPassword.error,
        ),
        resetPasswordValues: values,
      });
    }

    const result = await resetInternalUserPassword({
      targetUserId: userId,
      temporaryPassword: parsedResetPassword.data.temporaryPassword,
      updatedByUserId: appUser.id,
    });

    if (!result.ok) {
      return buildDetailActionError({
        form: "reset-password",
        message: result.error,
      });
    }

    throw redirect(
      buildNotificationDetailHref(
        request.url,
        userId,
        "usuario-interno-restablecido",
      ),
    );
  }

  const values = readUpdateInternalUserFormValues(formData);
  const parsed = updateInternalUserSchema.safeParse(values);

  if (!parsed.success) {
    return buildDetailActionError({
      form: "edit",
      message: "Revisá los datos del Usuario interno.",
      fieldErrors: getUpdateInternalUserFieldErrors(parsed.error),
      editValues: values,
    });
  }

  const result = await updateInternalUser({
    userId,
    name: parsed.data.name,
    email: parsed.data.email,
    role: parsed.data.role,
    updatedByUserId: appUser.id,
  });

  if (!result.ok) {
    return buildDetailActionError({
      form: "edit",
      message: result.error,
      fieldErrors: getUpdateInternalUserServerFieldErrors(result.error),
      editValues: values,
    });
  }

  throw redirect(
    buildNotificationDetailHref(
      request.url,
      userId,
      "usuario-interno-actualizado",
    ),
  );
}

async function findDetailUserRow(
  userId: string,
): Promise<DetailUserRow | null> {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      internalUsername: user.internalUsername,
      requiresPasswordChange: user.requiresPasswordChange,
      suspended: user.suspended,
      academyId: academies.id,
      academyName: academies.name,
      academyContactName: academies.contactName,
    })
    .from(user)
    .leftJoin(academies, eq(academies.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

function requireUserId(userId: string | undefined) {
  if (!userId) {
    throw new Response(userNotFoundMessage, { status: 404 });
  }

  return userId;
}
