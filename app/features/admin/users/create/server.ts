import { createInternalUser } from "@/lib/admin/users/internal-user-create.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";

import {
  createInternalUserSchema,
  getCreateInternalUserServerFieldErrors,
  getCreateInternalUserValidationFieldErrors,
  readCreateInternalUserFormValues,
} from "./shared";

export async function loader({ request }: { request: Request }) {
  await requireAdminPanelUser(request);
  return {};
}

export async function action({ request }: { request: Request }) {
  const appUser = await requireAdminPanelUser(request);
  const formData = await request.formData();
  const values = readCreateInternalUserFormValues(formData);
  const parsed = createInternalUserSchema.safeParse(values);

  if (!parsed.success) {
    return {
      form: "create" as const,
      status: "error" as const,
      message: "Revisá los datos del Usuario interno.",
      fieldErrors: getCreateInternalUserValidationFieldErrors(parsed.error),
      values,
    };
  }

  const result = await createInternalUser({
    name: parsed.data.name,
    internalUsername: parsed.data.internalUsername,
    role: parsed.data.role,
    temporaryPassword: parsed.data.temporaryPassword,
    email: parsed.data.email,
    createdByUserId: appUser.id,
  });

  if (!result.ok) {
    return {
      form: "create" as const,
      status: "error" as const,
      message: result.error,
      fieldErrors: getCreateInternalUserServerFieldErrors(result.error),
      values: {
        ...values,
        temporaryPassword: "",
      },
    };
  }

  throw await redirectWithFlashNotification(
    `/administracion/usuarios/${result.userId}`,
    "usuario-interno-creado",
  );
}
