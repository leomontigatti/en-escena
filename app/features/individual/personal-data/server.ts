import { requireIndividualUser } from "@/lib/auth/internal-access.server";
import { deriveIndividualLinkState } from "@/lib/individuals/link-state";
import {
  parseIndividualPersonalData,
  readIndividualPersonalDataValues,
} from "@/lib/individuals/personal-data";
import {
  updateIndividualPersonalData,
  type IndividualDocumentPhotoChange,
} from "@/lib/individuals/personal-data.server";
import { notificationToasts } from "@/lib/shared/notification-toasts";
import { formatUploadRejection } from "@/lib/storage/asset-kinds";
import {
  createDefaultIndividualDocumentPhotoStorage,
  loadIndividualDocumentPhotoUrl,
} from "@/lib/storage/individual-document-photos.server";

import {
  documentPhotoFileField,
  documentPhotoStorageKeyField,
  type IndividualPersonalDataActionData,
  type ProfileFormValues,
} from "./shared";

export async function loadIndividualPersonalData(request: Request) {
  const { user, individual } = await requireIndividualUser(request);

  return {
    documentPhotoUrl: await loadIndividualDocumentPhotoUrl({
      documentPhotoStorageKey: individual.documentPhotoStorageKey,
      storage: createDefaultIndividualDocumentPhotoStorage(),
    }),
    email: user.email,
    linkState: deriveIndividualLinkState(individual),
    values: {
      firstName: individual.firstName,
      lastName: individual.lastName,
      documentType: individual.documentType,
      documentNumber: individual.documentNumber,
      phone: individual.phone,
      documentPhotoStorageKey: individual.documentPhotoStorageKey ?? "",
    } satisfies ProfileFormValues,
  };
}

export async function handleIndividualPersonalDataAction(
  request: Request,
): Promise<IndividualPersonalDataActionData> {
  const { individual } = await requireIndividualUser(request);
  const formData = await request.formData();
  const documentPhoto = readDocumentPhotoChange(formData);
  const values: ProfileFormValues = {
    ...readIndividualPersonalDataValues(formData),
    documentPhotoStorageKey:
      documentPhoto.kind === "remove"
        ? ""
        : (individual.documentPhotoStorageKey ?? ""),
  };
  const parsed = parseIndividualPersonalData(values);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Revisá los datos del formulario.",
      fieldErrors: parsed.fieldErrors,
      values,
    };
  }

  const saved = await updateIndividualPersonalData({
    data: parsed.data,
    documentPhoto,
    individual,
  });

  if (!saved.ok) {
    return {
      status: "error",
      message: formatUploadRejection(saved.rejection),
      fieldErrors: {},
      values,
    };
  }

  return {
    status: "success",
    message: notificationToasts["personal-data-saved"].message,
  };
}

/**
 * A picked file replaces the photo; an empty key field removes it; a body
 * without the key field, or with the stored key, keeps it.
 */
function readDocumentPhotoChange(
  formData: FormData,
): IndividualDocumentPhotoChange {
  const file = formData.get(documentPhotoFileField);

  if (file instanceof File && file.size > 0) {
    return { file, kind: "upload" };
  }

  return formData.get(documentPhotoStorageKeyField) === ""
    ? { kind: "remove" }
    : { kind: "keep" };
}
