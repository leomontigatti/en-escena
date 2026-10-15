import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { readOwnerEventPayments } from "@/lib/finances/owner-event-payments.server";
import { getPortalActiveEventPaymentInstructionsContext } from "@/lib/portal/event-context.server";

export async function loadPortalAcademyPayments(request: Request) {
  const [{ academy }, eventContext] = await Promise.all([
    requireAcademyUser(request),
    getPortalActiveEventPaymentInstructionsContext(request),
  ]);

  if (!eventContext.activeEvent) {
    return {
      activeEvent: null,
      paymentInstructions: null,
      payments: [],
    };
  }

  return {
    activeEvent: eventContext.activeEvent,
    paymentInstructions: eventContext.paymentInstructions,
    payments: await readOwnerEventPayments({
      academyId: academy.id,
      eventId: eventContext.activeEvent.id,
    }),
  };
}
