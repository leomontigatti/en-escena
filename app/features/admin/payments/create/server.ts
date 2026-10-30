import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { registerAcademyEventPayment } from "@/features/admin/finances/academy-choreographies/payments.server";
import { refundRegistrationRefusalMessage } from "@/features/admin/finances/refunds/server";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelWriter } from "@/lib/auth/internal-access.server";
import { registerRefund } from "@/lib/finances/refunds.server";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";
import { getFieldErrors } from "@/lib/shared/form-validation";
import { readFormData } from "@/lib/shared/read-form-data";

import { listPaymentAcademyOptions } from "../academy-options.server";
import {
  createMovementFieldNames,
  createMovementSchema,
  defaultCreateMovementValues,
  readCreateMovementValues,
  type CreateMovementActionData,
} from "./shared";

export async function loadMovementCreate(request: Request) {
  await requireAdminPanelWriter(request);
  const eventContext = await loadEventContext(request);

  return {
    academies: await listPaymentAcademyOptions(),
    selectedEventId: eventContext.selectedEventId,
    values: defaultCreateMovementValues(),
  };
}

export async function handleMovementCreateAction(
  request: Request,
): Promise<CreateMovementActionData | never> {
  await requireAdminPanelWriter(request);
  const eventContext = await loadEventContext(request);
  const formData = await readFormData(request);
  const values = readCreateMovementValues(formData);

  if (eventContext.selectedEventId === null) {
    return {
      status: "error",
      message: "Activá un evento para registrar movimientos.",
      fieldErrors: {},
      values,
    };
  }

  const parsed = createMovementSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Revisá los datos del movimiento.",
      fieldErrors: getFieldErrors(parsed.error, createMovementFieldNames),
      values,
    };
  }

  const academy = await db.query.academies.findFirst({
    columns: { id: true },
    where: eq(academies.id, parsed.data.academyId),
  });

  if (!academy) {
    return {
      status: "error",
      message: "Revisá los datos del movimiento.",
      fieldErrors: {
        academyId: "Seleccioná una academia válida.",
      },
      values,
    };
  }

  const movement = {
    academyId: parsed.data.academyId,
    amount: Number(parsed.data.amount),
    eventId: eventContext.selectedEventId,
    internalNote: parsed.data.internalNote || null,
    reference: parsed.data.reference || null,
  };

  if (parsed.data.movementKind === "refund") {
    const result = await registerRefund({
      ...movement,
      refundDate: parsed.data.paymentDate,
      refundMethod: parsed.data.paymentMethod,
    });

    if (!result.ok) {
      return {
        status: "error",
        message: refundRegistrationRefusalMessage(result),
        fieldErrors: {},
        values,
      };
    }

    // A refund has no page of its own: it is read from the list.
    throw await redirectWithFlashNotification(
      "/administracion/movimientos",
      "refund-recorded",
    );
  }

  const { paymentId } = await registerAcademyEventPayment({
    ...movement,
    paymentDate: parsed.data.paymentDate,
    paymentMethod: parsed.data.paymentMethod,
  });

  throw await redirectWithFlashNotification(
    `/administracion/movimientos/pagos/${paymentId}`,
    "payment-recorded",
  );
}
