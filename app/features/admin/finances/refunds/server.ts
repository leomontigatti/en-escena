import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, refunds } from "@/db/schema";
import {
  createPaymentFieldNames,
  createPaymentSchema,
  readCreatePaymentValues,
  type CreatePaymentFormValues,
} from "@/features/admin/payments/create/shared";
import { loadEventContext } from "@/lib/admin/event-context.server";
import {
  requireAdminPanelReader,
  requireAdminPanelWriter,
} from "@/lib/auth/internal-access.server";
import { canWriteInAdminPanel } from "@/lib/auth/user-role.shared";
import { formatAmount } from "@/lib/finances/formatters";
import {
  deleteRefund,
  updateRefund,
  type RefundRefusal,
} from "@/lib/finances/refunds.server";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";
import { getFieldErrors } from "@/lib/shared/form-validation";
import { readFormData } from "@/lib/shared/read-form-data";

import {
  deleteRefundIntent,
  updateRefundIntent,
  type RefundDetailActionData,
} from "./shared";

/**
 * A `Reembolso`'s page: the form it was registered with, administration writing
 * and the auditor reading. Its academy and event are fixed, so the form shows
 * them locked and the action never reads them.
 */
export async function loadRefundDetail(request: Request, refundId: string) {
  const user = await requireAdminPanelReader(request);
  const eventContext = await loadEventContext(request);

  const [refund] = await db
    .select({
      academyId: refunds.academyId,
      academyName: academies.name,
      amount: refunds.amount,
      eventId: refunds.eventId,
      id: refunds.id,
      internalNote: refunds.internalNote,
      reference: refunds.reference,
      refundDate: refunds.refundDate,
      refundMethod: refunds.refundMethod,
      refundNumber: refunds.refundNumber,
      updatedAt: refunds.updatedAt,
    })
    .from(refunds)
    .innerJoin(academies, eq(refunds.academyId, academies.id))
    .where(eq(refunds.id, refundId))
    .limit(1);

  if (!refund) {
    throw new Response("No encontramos ese reembolso.", { status: 404 });
  }

  return {
    canWrite: canWriteInAdminPanel(user.role),
    refund,
    selectedEventId: eventContext.selectedEventId ?? refund.eventId,
    values: {
      academyId: refund.academyId,
      amount: String(refund.amount),
      internalNote: refund.internalNote ?? "",
      paymentDate: refund.refundDate,
      paymentMethod: refund.refundMethod,
      reference: refund.reference ?? "",
    } satisfies CreatePaymentFormValues,
    // Read with the fields above: the version a save is checked against.
    version: refund.updatedAt.toISOString(),
  };
}

export async function handleRefundDetailAction(
  request: Request,
  refundId: string,
): Promise<RefundDetailActionData | never> {
  await requireAdminPanelWriter(request);
  const formData = await readFormData(request);
  const intent = String(formData.get("intent") ?? "");

  if (intent === updateRefundIntent) {
    return await updateRefundFromForm({ formData, refundId });
  }

  if (intent === deleteRefundIntent) {
    return await deleteRefundFromForm({ formData, refundId });
  }

  throw new Response("Acción no soportada.", { status: 400 });
}

async function updateRefundFromForm(input: {
  formData: FormData;
  refundId: string;
}): Promise<RefundDetailActionData> {
  const values = readCreatePaymentValues(input.formData);
  const version = String(input.formData.get("version") ?? "");
  const parsed = createPaymentSchema.safeParse(values);

  if (!parsed.success) {
    return {
      fieldErrors: getFieldErrors(parsed.error, createPaymentFieldNames),
      intent: updateRefundIntent,
      message: "Revisá los datos del reembolso.",
      status: "error",
      values,
      version,
    };
  }

  const result = await updateRefund({
    amount: Number(parsed.data.amount),
    internalNote: parsed.data.internalNote || null,
    reference: parsed.data.reference || null,
    refundDate: parsed.data.paymentDate,
    refundId: input.refundId,
    refundMethod: parsed.data.paymentMethod,
    version,
  });

  if (result.ok) {
    return {
      intent: updateRefundIntent,
      message: "Reembolso guardado.",
      status: "success",
    };
  }

  return {
    fieldErrors: {},
    intent: updateRefundIntent,
    message: refusalMessage(
      result,
      (capAmount) =>
        `El reembolso no puede superar ${formatAmount(capAmount)}, el saldo disponible más su monto actual.`,
    ),
    status: "error",
    ...(isChangedMeanwhile(result) ? {} : { values, version }),
  };
}

async function deleteRefundFromForm(input: {
  formData: FormData;
  refundId: string;
}): Promise<RefundDetailActionData | never> {
  const result = await deleteRefund({
    refundId: input.refundId,
    version: String(input.formData.get("version") ?? ""),
  });

  if (!result.ok) {
    return {
      intent: deleteRefundIntent,
      message: refusalMessage(result, refundAboveBalanceMessage),
      status: "error",
    };
  }

  throw await redirectWithFlashNotification(
    "/administracion/movimientos",
    "refund-deleted",
  );
}

/** The copy for a refusal of `registerRefund`, shown as the submit's toast. */
export function refundRegistrationRefusalMessage(refusal: RefundRefusal) {
  return refusalMessage(refusal, refundAboveBalanceMessage);
}

function isChangedMeanwhile(refusal: RefundRefusal) {
  return refusal.reason === "moved" || refusal.reason === "stale";
}

/**
 * The copy for a refusal of the write module. The cap reads differently on a
 * registration (the `Saldo disponible`) and on an edit (which also counts the
 * refund's own amount), so the caller words it.
 */
function refusalMessage(
  refusal: RefundRefusal,
  overCapMessage: (capAmount: number) => string,
) {
  switch (refusal.reason) {
    case "future-date":
      return "La fecha no puede ser futura.";
    case "moved":
    case "stale":
      return "El reembolso cambió mientras se guardaba. Revisalo y volvé a intentarlo.";
    case "no-balance":
      return "No hay saldo disponible para reembolsar.";
    case "over-cap":
      return overCapMessage(refusal.capAmount);
  }
}

function refundAboveBalanceMessage(capAmount: number) {
  return `El reembolso no puede superar el saldo disponible de ${formatAmount(capAmount)}.`;
}
