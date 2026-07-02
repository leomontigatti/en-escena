import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { priceActionHandler } from "@/lib/admin/events/bases-action/prices.server";
import { runEventBasesActionWithHandler } from "@/lib/admin/events/bases-action/runner.server";
import { type ActionData } from "@/lib/admin/events/bases-action/shared.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";

type EventPriceIntent = "create-price" | "update-price" | "delete-price";

type HandleEventPriceActionOptions = {
  allowedIntents?: EventPriceIntent[];
};

export async function handleEventPriceAction(
  request: Request,
  options: HandleEventPriceActionOptions = {},
): Promise<ActionData | never> {
  await requireAdminPanelUser(request);

  const eventContext = await loadAdminEventContext(request);
  const eventId = eventContext.selectedEventId;

  if (!eventId) {
    return {
      status: "error",
      message: "Elegí un Evento activo antes de guardar las Bases del evento.",
      fieldErrors: {},
      scope: null,
    };
  }

  return runEventBasesActionWithHandler({
    allowedIntents: options.allowedIntents,
    eventId,
    handler: priceActionHandler,
    request,
  });
}
