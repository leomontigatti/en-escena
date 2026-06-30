import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies, academyEventPayments } from "@/db/schema";
import {
  annulPaymentSchema,
  correctionFieldNames,
} from "@/features/admin/academies/account-current/shared";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireAdminUser } from "@/lib/auth/internal-access.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { annulPayment } from "@/lib/finances/account-current-corrections.server";
import { getFieldErrors } from "@/lib/shared/form-validation";

export type AdminPaymentDetailActionData = {
  fieldErrors: Partial<Record<"paymentId" | "reason", string>>;
  message: string;
  status: "error";
  values: {
    paymentId: string;
    reason: string;
  };
};

export async function loadAdminPaymentDetail(
  request: Request,
  paymentId: string,
) {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);

  const payment = await db
    .select({
      academyId: academyEventPayments.academyId,
      academyName: academies.name,
      amount: academyEventPayments.amount,
      annulledAt: academyEventPayments.annulledAt,
      annulledReason: academyEventPayments.annulledReason,
      eventId: academyEventPayments.eventId,
      id: academyEventPayments.id,
      internalNote: academyEventPayments.internalNote,
      paymentDate: academyEventPayments.paymentDate,
      paymentMethod: academyEventPayments.paymentMethod,
      paymentNumber: academyEventPayments.paymentNumber,
      reference: academyEventPayments.reference,
    })
    .from(academyEventPayments)
    .innerJoin(academies, eq(academyEventPayments.academyId, academies.id))
    .where(eq(academyEventPayments.id, paymentId))
    .limit(1);

  const paymentDetail = payment[0];

  if (!paymentDetail) {
    throw new Response("No encontramos ese pago.", { status: 404 });
  }

  return {
    payment: paymentDetail,
    selectedEventId: eventContext.selectedEventId ?? paymentDetail.eventId,
  };
}

export async function handleAdminPaymentDetailAction(
  request: Request,
  paymentId: string,
): Promise<AdminPaymentDetailActionData | never> {
  const adminUser = await requireAdminUser(request);
  const formData = await request.formData();
  const values = {
    paymentId,
    reason: String(formData.get("reason") ?? "").trim(),
  };
  const parsed = annulPaymentSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Revisá los datos de la corrección.",
      fieldErrors: getFieldErrors(parsed.error, correctionFieldNames),
      values,
    };
  }

  const payment = await db.query.academyEventPayments.findFirst({
    columns: {
      academyId: true,
      eventId: true,
    },
    where: eq(academyEventPayments.id, paymentId),
  });

  if (!payment) {
    throw new Response("No encontramos ese pago.", { status: 404 });
  }

  const result = await annulPayment({
    academyId: payment.academyId,
    annulledByUserId: adminUser.id,
    eventId: payment.eventId,
    paymentId,
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
      fieldErrors: result.fieldErrors,
      values,
    };
  }

  throw redirect(request.url);
}
