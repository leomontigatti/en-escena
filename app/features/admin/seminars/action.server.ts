import {
  createSeminar,
  deleteSeminar,
  getSeminar,
  setSeminarInstructorPicture,
  updateSeminar,
  type SeminarFailure,
  type SeminarInput,
  type SeminarRow,
} from "@/lib/seminars/repository.server";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";
import { getFieldErrors } from "@/lib/shared/form-validation";
import { notificationToasts } from "@/lib/shared/notification-toasts";
import { buildDetailPath, buildListPath } from "@/lib/shared/navigation";
import { formatUploadRejection } from "@/lib/storage/asset-kinds";
import { createDefaultSeminarPictureStorage } from "@/lib/storage/seminar-pictures.server";

import { loadSeminarContext } from "./server";
import {
  basePath,
  createSeminarIntent,
  deleteSeminarIntent,
  keptSeminarPictureValue,
  readSeminarFormValues,
  seminarFieldNames,
  seminarFormSchema,
  seminarPictureFileField,
  seminarPictureKeptField,
  seminarPicturePresentField,
  updateSeminarIntent,
  type SeminarActionData,
  type SeminarFormValues,
} from "./shared";

const noActiveEventError = "Elegí un evento activo para gestionar seminarios.";
const invalidSeminarError = "Revisá los datos del seminario.";

export async function handleSeminarCreateAction(
  request: Request,
): Promise<SeminarActionData | never> {
  const { selectedEventId } = await loadSeminarContext(request);
  const formData = await request.formData();
  const values = readSeminarFormValues(formData);

  if (!selectedEventId) {
    return {
      status: "error",
      intent: createSeminarIntent,
      message: noActiveEventError,
      values,
    };
  }

  const parsed = parseSeminarInput(values);

  if (!parsed.ok) {
    return { ...parsed.actionData, intent: createSeminarIntent };
  }

  const result = await createSeminar(selectedEventId, parsed.input);

  if (!result.ok) {
    return toFailureActionData(result, createSeminarIntent, values);
  }

  throw await redirectWithFlashNotification(
    buildDetailPath(basePath, result.seminar.id, selectedEventId),
    "seminario-creado",
  );
}

export async function handleSeminarDetailAction(
  request: Request,
  seminarId: string,
): Promise<SeminarActionData | never> {
  const { selectedEventId } = await loadSeminarContext(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === deleteSeminarIntent) {
    return await removeSeminar(formData, seminarId, selectedEventId);
  }

  if (intent !== updateSeminarIntent) {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const values = readSeminarFormValues(formData);
  const parsed = parseSeminarInput(values);

  if (!parsed.ok) {
    return { ...parsed.actionData, intent: updateSeminarIntent };
  }

  const result = await updateSeminar(seminarId, parsed.input);

  if (!result.ok) {
    return toFailureActionData(result, updateSeminarIntent, values);
  }

  const picture = await applySeminarPictureChange(formData, result.seminar);

  if (!picture.ok) {
    return {
      status: "error",
      intent: updateSeminarIntent,
      message: picture.message,
      values,
    };
  }

  return {
    status: "success",
    intent: updateSeminarIntent,
    message: notificationToasts["seminario-guardado"].message,
  };
}

async function removeSeminar(
  formData: FormData,
  seminarId: string,
  selectedEventId: string | null,
): Promise<SeminarActionData | never> {
  if (String(formData.get("confirmDeletion") ?? "").trim() !== seminarId) {
    return {
      status: "error",
      intent: deleteSeminarIntent,
      message: "Confirmá la eliminación del seminario.",
    };
  }

  // The object goes first: a delete that reported success over bytes that
  // survived is the one outcome "eliminar" must not mean. `removeInstructorPicture`
  // tolerates an object that is already gone, so a retry converges.
  const seminar = await getSeminar(seminarId);

  if (seminar?.instructorPictureStorageKey) {
    await createDefaultSeminarPictureStorage().removeInstructorPicture(
      seminar.instructorPictureStorageKey,
    );
  }

  const result = await deleteSeminar(seminarId);

  if (!result.ok) {
    return {
      status: "error",
      intent: deleteSeminarIntent,
      message: result.error,
    };
  }

  throw await redirectWithFlashNotification(
    buildListPath(basePath, selectedEventId),
    "seminario-eliminado",
  );
}

/**
 * The picture rides on the seminar's own "Guardar", as the event's PDFs ride on
 * the event's. A body without the marker is left alone: an absent file input
 * and an absent "kept" field look exactly like "remove the picture", and the
 * costly way to be wrong about that is the one that deletes.
 */
async function applySeminarPictureChange(
  formData: FormData,
  seminar: SeminarRow,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (formData.get(seminarPicturePresentField) !== keptSeminarPictureValue) {
    return { ok: true };
  }

  const storage = createDefaultSeminarPictureStorage();
  const file = formData.get(seminarPictureFileField);

  // A chosen file always wins: picking one after clearing the field is a
  // replacement, not a removal followed by an upload.
  if (file instanceof File && file.size > 0) {
    const result = await storage.uploadInstructorPicture({
      eventId: seminar.eventId,
      file,
      seminarId: seminar.id,
    });

    if (!result.ok) {
      return { ok: false, message: formatUploadRejection(result.rejection) };
    }

    await setSeminarInstructorPicture(seminar.id, result.storageKey);

    return { ok: true };
  }

  const isKept =
    formData.get(seminarPictureKeptField) === keptSeminarPictureValue;

  if (seminar.instructorPictureStorageKey && !isKept) {
    await storage.removeInstructorPicture(seminar.instructorPictureStorageKey);
    await setSeminarInstructorPicture(seminar.id, null);
  }

  return { ok: true };
}

function parseSeminarInput(
  values: SeminarFormValues,
):
  | { ok: true; input: SeminarInput }
  | { ok: false; actionData: Omit<SeminarActionData, "intent"> } {
  const parsed = seminarFormSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      actionData: {
        status: "error",
        message: invalidSeminarError,
        fieldErrors: getFieldErrors(parsed.error, seminarFieldNames),
        values,
      },
    };
  }

  return {
    ok: true,
    input: {
      instructorName: parsed.data.instructorName,
      scheduledDate: parsed.data.scheduledDate,
      startTime: parsed.data.startTime,
      quota: Number(parsed.data.quota),
    },
  };
}

function toFailureActionData(
  failure: SeminarFailure,
  intent: string,
  values: SeminarFormValues,
): SeminarActionData {
  if (failure.code === "seminar-not-found") {
    throw new Response(failure.error, { status: 404 });
  }

  return {
    status: "error",
    intent,
    message: failure.error,
    fieldErrors: failure.fieldErrors,
    values,
  };
}
