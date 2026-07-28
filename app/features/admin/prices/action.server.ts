import { priceActionHandler } from "@/lib/admin/events/bases-action/prices.server";
import { runSelectedEventBasesAction } from "@/lib/admin/events/bases-action/route.server";
import { type ActionData } from "@/lib/admin/events/bases-action/shared.server";

type EventPriceIntent = "create-price" | "update-price" | "delete-price";

type HandleEventPriceActionOptions = {
  allowedIntents?: EventPriceIntent[];
};

export async function handleEventPriceAction(
  request: Request,
  options: HandleEventPriceActionOptions = {},
): Promise<ActionData | never> {
  return runSelectedEventBasesAction({
    allowedIntents: options.allowedIntents,
    handler: priceActionHandler,
    request,
  });
}
