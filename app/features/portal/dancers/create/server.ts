import { z } from "zod";

import {
  createDancerForAcademy,
  type CreateDancerInput,
} from "@/lib/portal/dancers.server";
import { routeNotificationToasts } from "@/lib/shared/route-notification-toasts";
import {
  createDancerSchema,
  type CreateDancerFormValues,
} from "@/features/portal/dancers/create/shared";

export async function handleCreateDancerAction({
  academyId,
  formData,
}: {
  academyId: string;
  formData: FormData;
}) {
  const values = {
    firstName: formValue(formData, "firstName"),
    lastName: formValue(formData, "lastName"),
    birthDate: formValue(formData, "birthDate"),
  };
  const parsed = createDancerSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error" as const,
      fieldErrors: getCreateDancerFieldErrors(parsed.error),
      values,
      modalOpen: true,
    };
  }

  const result = await createDancerForAcademy(academyId, parsed.data);

  if (!result.ok) {
    return {
      status: "error" as const,
      fieldErrors: result.fieldErrors,
      values: result.values,
      modalOpen: true,
    };
  }

  return {
    status: "success" as const,
    message: routeNotificationToasts["bailarin-creado"].message,
  };
}

function formValue(formData: FormData, fieldName: keyof CreateDancerInput) {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : "";
}

function getCreateDancerFieldErrors(error: z.ZodError<CreateDancerFormValues>) {
  const fieldErrors = error.flatten().fieldErrors;

  return {
    firstName: fieldErrors.firstName?.[0],
    lastName: fieldErrors.lastName?.[0],
    birthDate: fieldErrors.birthDate?.[0],
  };
}
