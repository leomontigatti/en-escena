import {
  getEventFormErrorMessage,
  parseEventFormValues,
  readEventFormValues,
} from "@/lib/admin/events/form-values";
import { requireAdminPanelWriter } from "@/lib/auth/internal-access.server";
import { createEvent } from "@/lib/events/management.server";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";
import { readFormData } from "@/lib/shared/read-form-data";

/** Only the administrator opens the new event form. */
export async function requireEventCreator(request: Request) {
  await requireAdminPanelWriter(request);
}

export async function createAdministrativeEvent(request: Request) {
  await requireEventCreator(request);

  const formData = await readFormData(request);
  const values = readEventFormValues(formData);
  const parsed = parseEventFormValues(values);

  if (!parsed.ok) {
    return {
      status: "error" as const,
      message: "Revisá los datos del Evento.",
      fieldErrors: parsed.fieldErrors,
      values,
    };
  }

  const result = await createEvent(parsed.input);

  if (!result.ok) {
    const fieldErrors = result.fieldErrors ?? {};

    return {
      status: "error" as const,
      message: getEventFormErrorMessage(fieldErrors, result.error),
      fieldErrors,
      values,
    };
  }

  throw await redirectWithFlashNotification(
    `/administracion/eventos/${result.event.id}`,
    "event-saved",
  );
}
