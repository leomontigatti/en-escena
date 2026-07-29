import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { registerAcademyEventPayment } from "@/features/admin/finances/academy-choreographies/payments.server";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireAdminUser } from "@/lib/auth/internal-access.server";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";
import { getFieldErrors } from "@/lib/shared/form-validation";

import { listPaymentAcademyOptions } from "../academy-options.server";
import {
  createPaymentFieldNames,
  createPaymentSchema,
  defaultCreatePaymentValues,
  readCreatePaymentValues,
  type CreatePaymentActionData,
} from "./shared";

export async function loadPaymentCreate(request: Request) {
  await requireAdminUser(request);
  const eventContext = await loadEventContext(request);

  return {
    academies: await listPaymentAcademyOptions(),
    selectedEventId: eventContext.selectedEventId,
    values: defaultCreatePaymentValues(),
  };
}

export async function handlePaymentCreateAction(
  request: Request,
): Promise<CreatePaymentActionData | never> {
  await requireAdminUser(request);
  const eventContext = await loadEventContext(request);
  const formData = await request.formData();
  const values = readCreatePaymentValues(formData);

  if (eventContext.selectedEventId === null) {
    return {
      status: "error",
      message: "Activá un evento para registrar pagos.",
      fieldErrors: {},
      values,
    };
  }

  const parsed = createPaymentSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Revisá los datos del pago.",
      fieldErrors: getFieldErrors(parsed.error, createPaymentFieldNames),
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
      message: "Revisá los datos del pago.",
      fieldErrors: {
        academyId: "Seleccioná una academia válida.",
      },
      values,
    };
  }

  const { paymentId } = await registerAcademyEventPayment({
    academyId: parsed.data.academyId,
    amount: Number(parsed.data.amount),
    eventId: eventContext.selectedEventId,
    internalNote: parsed.data.internalNote || null,
    paymentDate: parsed.data.paymentDate,
    paymentMethod: parsed.data.paymentMethod,
    reference: parsed.data.reference || null,
  });

  throw await redirectWithFlashNotification(
    `/administracion/pagos/${paymentId}`,
    "pago-registrado",
  );
}
