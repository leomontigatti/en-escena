import { runSelectedEventBasesAction } from "@/lib/admin/events/bases-action/route.server";
import {
  scheduleActionHandler,
  type EventScheduleIntent,
} from "@/lib/admin/events/bases-action/schedules.server";
import { type ActionData } from "@/lib/admin/events/bases-action/shared.server";

type HandleEventScheduleActionOptions = {
  allowedIntents?: EventScheduleIntent[];
};

export async function handleEventScheduleAction(
  request: Request,
  options: HandleEventScheduleActionOptions = {},
): Promise<ActionData | never> {
  return runSelectedEventBasesAction({
    allowedIntents: options.allowedIntents,
    handler: scheduleActionHandler,
    request,
  });
}
