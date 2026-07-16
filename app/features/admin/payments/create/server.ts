import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { registerAcademyEventPayment } from "@/features/admin/academies/account-current/payments.server";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireAdminUser } from "@/lib/auth/internal-access.server";
import { getFieldErrors } from "@/lib/shared/form-validation";

import { listAdminPaymentAcademyOptions } from "../academy-options.server";
import {
  createPaymentFieldNames,
  createPaymentSchema,
  defaultCreatePaymentValues,
  readCreatePaymentValues,
  type CreatePaymentActionData,
} from "./shared";

export async function loadAdminPaymentCreate(request: Request) {
  await requireAdminUser(request);
  const eventContext = await loadAdminEventContext(request);

  return {
    academies: await listAdminPaymentAcademyOptions(),
    selectedEventId: eventContext.selectedEventId,
    values: defaultCreatePaymentValues(),
  };
}

export async function handleAdminPaymentCreateAction(
  request: Request,
): Promise<CreatePaymentActionData | never> {
  await requireAdminUser(request);
  const eventContext = await loadAdminEventContext(request);
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

  await registerAcademyEventPayment({
    academyId: parsed.data.academyId,
    amount: Number(parsed.data.amount),
    eventId: eventContext.selectedEventId,
    internalNote: parsed.data.internalNote || null,
    paymentDate: parsed.data.paymentDate,
    paymentMethod: parsed.data.paymentMethod,
    reference: parsed.data.reference || null,
  });

  throw redirect(
    `/administracion/pagos?evento=${eventContext.selectedEventId}`,
  );
}
