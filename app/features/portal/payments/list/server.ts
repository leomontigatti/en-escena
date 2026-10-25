import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { readOwnerEventMovements } from "@/lib/finances/owner-event-movements.server";
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
      movements: [],
    };
  }

  return {
    activeEvent: eventContext.activeEvent,
    paymentInstructions: eventContext.paymentInstructions,
    movements: await readOwnerEventMovements({
      academyId: academy.id,
      eventId: eventContext.activeEvent.id,
    }),
  };
}
