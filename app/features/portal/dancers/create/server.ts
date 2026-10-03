import { z } from "zod";

import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { findActiveEventStartDateOnly } from "@/lib/events/active-event.server";
import { createDancerForAcademy } from "@/lib/portal/dancers.server";
import { readAcknowledgedDuplicateIds } from "@/lib/shared/duplicate-warning";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";
import {
  createDefaultDancerDocumentStorage,
  removeUnreferencedDocumentImages,
} from "@/lib/storage/dancer-documents.server";
import { uploadNewDancerDocumentImages } from "@/features/portal/dancers/detail/server";
import {
  buildPortalDancerSchema,
  getClientDocumentImageValidationMessage,
  portalDancerInvalidValuesMessage,
  readPortalDancerFormValues,
  type PortalDancerFormValues,
} from "@/features/portal/dancers/detail/shared";

import type { CreateDancerActionData } from "./shared";

const dancersListPath = "/portal/bailarines";

export async function loadPortalDancerCreate(request: Request) {
  await requireAcademyUser(request);

  return { activeEventStartDate: await findActiveEventStartDateOnly() };
}

export async function handlePortalDancerCreateAction(request: Request) {
  const { academy } = await requireAcademyUser(request);

  return await handleCreateDancerAction({
    academyId: academy.id,
    formData: await request.formData(),
  });
}

/**
 * Creates the dancer with its document photos, or answers why not. A save
 * that worked throws the redirect back to the list, with its toast in the
 * flash session.
 */
export async function handleCreateDancerAction({
  academyId,
  formData,
}: {
  academyId: string;
  formData: FormData;
}): Promise<NonNullable<CreateDancerActionData>> {
  const values = readPortalDancerFormValues(formData);
  const clientImageValidationMessage =
    getClientDocumentImageValidationMessage(formData);

  if (clientImageValidationMessage) {
    return {
      status: "error",
      message: clientImageValidationMessage,
      fieldErrors: {},
      values,
    };
  }

  // Parsed before any upload runs: a value the schema refuses must not leave
  // a file behind in the store.
  const parsed = buildPortalDancerSchema(
    await findActiveEventStartDateOnly(),
  ).safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      message: portalDancerInvalidValuesMessage,
      fieldErrors: getCreateDancerFieldErrors(parsed.error),
      values,
    };
  }

  const storage = createDefaultDancerDocumentStorage();
  const stored = { dancerId: "", keys: [] as string[] };
  // The row is written after the files, so whatever stops the save after an
  // upload — a refused file, a document the index refuses, a crash — takes
  // the stored files with it.
  const discardStoredImages = () =>
    removeUnreferencedDocumentImages({
      dancerId: stored.dancerId,
      storage,
      storageKeys: stored.keys,
    });
  const result = await createDancerForAcademy(academyId, parsed.data, {
    acknowledgedDuplicateIds: readAcknowledgedDuplicateIds(formData),
    storeDocumentImages: async (dancerId) => {
      const uploaded = await uploadNewDancerDocumentImages({
        academyId,
        dancerId,
        formData,
        storage,
      });
      stored.dancerId = dancerId;
      stored.keys = uploaded.uploadedKeys;

      return uploaded;
    },
  }).catch(async (thrown: unknown) => {
    await discardStoredImages();
    throw thrown;
  });

  if (!result.ok) {
    await discardStoredImages();
  }

  if (!result.ok && "warning" in result) {
    return { status: "warning", warning: result.warning, values };
  }

  if (!result.ok) {
    return {
      status: "error",
      message: result.error,
      fieldErrors: result.fieldErrors,
      values,
      ...(result.duplicateDocumentDancerId
        ? { duplicateDocumentDancerId: result.duplicateDocumentDancerId }
        : {}),
    };
  }

  throw await redirectWithFlashNotification(dancersListPath, "bailarin-creado");
}

function getCreateDancerFieldErrors(error: z.ZodError<PortalDancerFormValues>) {
  const fieldErrors = error.flatten().fieldErrors;

  return Object.fromEntries(
    Object.entries(fieldErrors).flatMap(([field, messages]) =>
      messages?.[0] ? [[field, messages[0]]] : [],
    ),
  );
}
