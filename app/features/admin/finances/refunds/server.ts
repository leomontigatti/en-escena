import { readFinanceAcademy } from "@/features/admin/finances/academy.server";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelWriter } from "@/lib/auth/internal-access.server";
import { formatAmount } from "@/lib/finances/formatters";
import {
  deleteRefund,
  registerRefund,
  updateRefund,
  type RefundRefusal,
} from "@/lib/finances/refunds.server";

import {
  deleteRefundIntent,
  readRegisterRefundValues,
  readUpdateRefundValues,
  registerRefundIntent,
  registerRefundSchema,
  updateRefundIntent,
  updateRefundSchema,
  type RefundActionData,
} from "./shared";

/**
 * Registers a `Reembolso` for the owner a finance page is about, against the
 * active event: administration only, and the cap is the write module's
 * (`registerRefund`). A dialog over the owner's `Movimientos` tab posts it, so
 * it answers in place and never redirects (docs/agents/form-feedback.md).
 */
export async function handleRegisterRefund(input: {
  academyId: string;
  formData: FormData;
  request: Request;
}): Promise<RefundActionData> {
  await requireAdminPanelWriter(input.request);
  const academy = await readFinanceAcademy(input.academyId);
  const eventContext = await loadEventContext(input.request);

  if (eventContext.selectedEventId === null) {
    return refusal(
      registerRefundIntent,
      "Activá un evento para registrar reembolsos.",
    );
  }

  const parsed = registerRefundSchema.safeParse(
    readRegisterRefundValues(input.formData),
  );

  if (!parsed.success) {
    return refusal(registerRefundIntent, firstIssue(parsed.error));
  }

  const result = await registerRefund({
    academyId: academy.id,
    amount: Number(parsed.data.amount),
    eventId: eventContext.selectedEventId,
    internalNote: parsed.data.internalNote || null,
    reference: parsed.data.reference || null,
    refundDate: parsed.data.refundDate,
    refundMethod: parsed.data.refundMethod,
  });

  if (!result.ok) {
    return refusal(
      registerRefundIntent,
      refusalMessage(result, refundAboveBalanceMessage),
    );
  }

  return {
    intent: registerRefundIntent,
    message: "Reembolso registrado.",
    status: "success",
  };
}

/**
 * Edits a `Reembolso` from the dialog on its row, in whichever list holds it:
 * administration only. No academy or event is read from the form: the refund
 * keeps its own, so it needs no active event either.
 */
export async function handleUpdateRefund(input: {
  formData: FormData;
  request: Request;
}): Promise<RefundActionData> {
  await requireAdminPanelWriter(input.request);

  const parsed = updateRefundSchema.safeParse(
    readUpdateRefundValues(input.formData),
  );

  if (!parsed.success) {
    return refusal(updateRefundIntent, firstIssue(parsed.error));
  }

  const result = await updateRefund({
    amount: Number(parsed.data.amount),
    internalNote: parsed.data.internalNote || null,
    reference: parsed.data.reference || null,
    refundDate: parsed.data.refundDate,
    refundId: parsed.data.refundId,
    refundMethod: parsed.data.refundMethod,
    version: parsed.data.version,
  });

  return result.ok
    ? {
        intent: updateRefundIntent,
        message: "Reembolso guardado.",
        status: "success",
      }
    : refusal(
        updateRefundIntent,
        refusalMessage(
          result,
          (capAmount) =>
            `El reembolso no puede superar ${formatAmount(capAmount)}, el saldo disponible más su monto actual.`,
        ),
      );
}

/** Deletes a `Reembolso` from the dialog on its row: administration only. */
export async function handleDeleteRefund(input: {
  formData: FormData;
  request: Request;
}): Promise<RefundActionData> {
  await requireAdminPanelWriter(input.request);

  const result = await deleteRefund({
    refundId: String(input.formData.get("refundId") ?? ""),
    version: String(input.formData.get("version") ?? ""),
  });

  return result.ok
    ? {
        intent: deleteRefundIntent,
        message: "Reembolso eliminado.",
        status: "success",
      }
    : refusal(
        deleteRefundIntent,
        refusalMessage(result, refundAboveBalanceMessage),
      );
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
      return "La fecha del reembolso no puede ser futura.";
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

function firstIssue(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Revisá los datos del reembolso.";
}

function refusal(
  intent: RefundActionData["intent"],
  message: string,
): RefundActionData {
  return { intent, message, status: "error" };
}
