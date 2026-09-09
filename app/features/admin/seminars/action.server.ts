import {
  createSeminar,
  deleteSeminar,
  updateSeminar,
  type SeminarFailure,
  type SeminarInput,
} from "@/lib/seminars/repository.server";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";
import { getFieldErrors } from "@/lib/shared/form-validation";
import { notificationToasts } from "@/lib/shared/notification-toasts";
import { buildDetailPath, buildListPath } from "@/lib/shared/navigation";

import { loadSeminarContext } from "./server";
import {
  basePath,
  createSeminarIntent,
  deleteSeminarIntent,
  readSeminarFormValues,
  seminarFieldNames,
  seminarFormSchema,
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
