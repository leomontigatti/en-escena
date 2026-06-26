import { redirect } from "react-router";

import {
  createAcademyProfessor,
  type CreateProfessorInput,
} from "@/lib/portal/professors.server";
import { createProfessorSchema } from "@/features/portal/professors/create/shared";

const createProfessorSuccessRedirect =
  "/portal/profesores?notificacion=profesor-creado";

export async function handleCreateProfessorAction({
  academyId,
  formData,
}: {
  academyId: string;
  formData: FormData;
}) {
  const values = {
    firstName: formValue(formData, "firstName"),
    lastName: formValue(formData, "lastName"),
  };
  const parsed = createProfessorSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error" as const,
      fieldErrors: {
        firstName: parsed.error.flatten().fieldErrors.firstName?.[0],
        lastName: parsed.error.flatten().fieldErrors.lastName?.[0],
      },
      values,
      modalOpen: true,
    };
  }

  const result = await createAcademyProfessor(academyId, parsed.data);

  if (!result.ok) {
    return {
      status: "error" as const,
      fieldErrors: result.fieldErrors,
      values: result.values,
      modalOpen: true,
    };
  }

  throw redirect(createProfessorSuccessRedirect);
}

function formValue(formData: FormData, fieldName: keyof CreateProfessorInput) {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : "";
}
