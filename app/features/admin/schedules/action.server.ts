import { runSelectedEventBasesAction } from "@/lib/admin/events/bases-action/route.server";
import { scheduleActionHandler } from "@/lib/admin/events/bases-action/schedules.server";
import { type ActionData } from "@/lib/admin/events/bases-action/shared.server";

type EventScheduleIntent =
  | "create-schedule"
  | "update-schedule"
  | "delete-schedule"
  | "create-schedule-capacity"
  | "update-schedule-capacity"
  | "delete-schedule-capacity";

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
