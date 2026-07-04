import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  runEventBasesActionWithHandler,
  type EventBasesActionHandler,
} from "@/lib/admin/events/bases-action/runner.server";
import {
  type ActionData,
  type EventBasesActionBaseInput,
} from "@/lib/admin/events/bases-action/shared.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";

type EventBasesRouteActionOptions<
  TIntent extends string,
  TInput extends EventBasesActionBaseInput,
> = {
  allowedIntents?: TIntent[];
  handler: EventBasesActionHandler<TInput>;
  recordId?: string;
  request: Request;
};

async function runSelectedEventBasesAction<
  TIntent extends string,
  TInput extends EventBasesActionBaseInput,
>({
  allowedIntents,
  handler,
  recordId,
  request,
}: EventBasesRouteActionOptions<TIntent, TInput>): Promise<ActionData | never> {
  await requireAdminPanelUser(request);

  const eventContext = await loadAdminEventContext(request);
  const eventId = eventContext.selectedEventId;

  if (!eventId) {
    return noActiveEventError();
  }

  return runEventBasesActionWithHandler({
    allowedIntents,
    eventId,
    handler,
    recordId,
    request,
  });
}

function noActiveEventError(): ActionData {
  return {
    status: "error",
    message: "Elegí un Evento activo antes de guardar las Bases del evento.",
    fieldErrors: {},
    scope: null,
  };
}

export { runSelectedEventBasesAction };
