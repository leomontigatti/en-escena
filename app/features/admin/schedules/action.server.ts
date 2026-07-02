import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { runEventBasesActionWithHandler } from "@/lib/admin/events/bases-action/runner.server";
import { scheduleActionHandler } from "@/lib/admin/events/bases-action/schedules.server";
import { type ActionData } from "@/lib/admin/events/bases-action/shared.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";

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
    handler: scheduleActionHandler,
    request,
  });
}
