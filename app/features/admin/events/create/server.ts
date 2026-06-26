import { redirect } from "react-router";

import {
  parseEventFormValues,
  readEventFormValues,
} from "@/lib/admin/events/form-values";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import { createEvent } from "@/lib/events/management.server";

import type { AdministrativeEventCreateActionData } from "./shared";

export async function createAdministrativeEvent(request: Request) {
  await requireAdminPanelUser(request);

  const formData = await request.formData();
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
    return {
      status: "error" as const,
      message: result.error,
      fieldErrors: result.fieldErrors ?? {},
      values,
    };
  }

  throw redirect(
    `/administracion/eventos/${result.event.id}?notificacion=evento-guardado`,
  );
}
