import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  createAcademyProfessor,
  type CreateProfessorInput,
} from "@/lib/portal/professors.server";
import { readAcknowledgedDuplicateIds } from "@/lib/shared/duplicate-warning";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";

import type { CreateProfessorActionData } from "./shared";

const professorsListPath = "/portal/profesores";

export async function loadPortalProfessorCreate(request: Request) {
  await requireAcademyUser(request);

  return null;
}

export async function handlePortalProfessorCreateAction(request: Request) {
  const { academy } = await requireAcademyUser(request);

  return await handleCreateProfessorAction({
    academyId: academy.id,
    formData: await request.formData(),
  });
}

/**
 * Creates the professor, or answers why not. A save that worked throws the
 * redirect back to the list, with its toast in the flash session.
 */
export async function handleCreateProfessorAction({
  academyId,
  formData,
}: {
  academyId: string;
  formData: FormData;
}): Promise<NonNullable<CreateProfessorActionData>> {
  const values = {
    firstName: formValue(formData, "firstName"),
    lastName: formValue(formData, "lastName"),
    documentType: formValue(formData, "documentType"),
    documentNumber: formValue(formData, "documentNumber"),
  };
  const result = await createAcademyProfessor(academyId, values, {
    acknowledgedDuplicateIds: readAcknowledgedDuplicateIds(formData),
  });

  if (!result.ok && "warning" in result) {
    return { status: "warning", warning: result.warning, values };
  }

  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
      fieldErrors: result.fieldErrors,
      values: result.values,
      ...(result.duplicateDocumentProfessorId
        ? { duplicateDocumentProfessorId: result.duplicateDocumentProfessorId }
        : {}),
    };
  }

  throw await redirectWithFlashNotification(
    professorsListPath,
    "profesor-creado",
  );
}

function formValue(formData: FormData, fieldName: keyof CreateProfessorInput) {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : "";
}
