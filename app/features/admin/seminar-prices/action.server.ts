import { runSelectedEventBasesAction } from "@/lib/admin/events/bases-action/route.server";
import { seminarPriceActionHandler } from "@/lib/admin/events/bases-action/seminar-prices.server";
import { type ActionData } from "@/lib/admin/events/bases-action/shared.server";

type SeminarPriceIntent =
  | "create-seminar-price"
  | "update-seminar-price"
  | "delete-seminar-price";

type HandleSeminarPriceActionOptions = {
  allowedIntents?: SeminarPriceIntent[];
};

export async function handleSeminarPriceAction(
  request: Request,
  options: HandleSeminarPriceActionOptions = {},
): Promise<ActionData | never> {
  return runSelectedEventBasesAction({
    allowedIntents: options.allowedIntents,
    handler: seminarPriceActionHandler,
    request,
  });
}
