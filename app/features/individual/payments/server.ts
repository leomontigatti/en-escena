import { requireIndividualUser } from "@/lib/auth/internal-access.server";
import { readOwnerEventMovements } from "@/lib/finances/owner-event-movements.server";
import { getPortalActiveEventPaymentInstructionsContext } from "@/lib/portal/event-context.server";

/**
 * The individual's `Movimientos`: its owner row's payments in the active event and
 * how to pay, read the way the portal's `Movimientos` reads an academy's.
 */
export async function loadIndividualPayments(request: Request) {
  const [{ individual }, eventContext] = await Promise.all([
    requireIndividualUser(request),
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
    payments: await readOwnerEventMovements({
      academyId: individual.ownerId,
      eventId: eventContext.activeEvent.id,
    }),
  };
}
