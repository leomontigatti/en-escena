import { readFinanceAcademy } from "@/features/admin/finances/academy.server";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelWriter } from "@/lib/auth/internal-access.server";
import { registerRefund } from "@/lib/finances/refunds.server";

import {
  readRegisterRefundValues,
  registerRefundIntent,
  registerRefundSchema,
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
    return refusal("Activá un evento para registrar reembolsos.");
  }

  const parsed = registerRefundSchema.safeParse(
    readRegisterRefundValues(input.formData),
  );

  if (!parsed.success) {
    return refusal(
      parsed.error.issues[0]?.message ?? "Revisá los datos del reembolso.",
    );
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
    return refusal(result.message);
  }

  return {
    intent: registerRefundIntent,
    message: "Reembolso registrado.",
    status: "success",
  };
}

function refusal(message: string): RefundActionData {
  return { intent: registerRefundIntent, message, status: "error" };
}
