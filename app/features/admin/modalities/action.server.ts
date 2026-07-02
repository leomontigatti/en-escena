import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { modalityActionHandler } from "@/lib/admin/events/bases-action/modalities.server";
import { runEventBasesActionWithHandler } from "@/lib/admin/events/bases-action/runner.server";
import { type ActionData } from "@/lib/admin/events/bases-action/shared.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";

type EventModalityIntent =
  | "create-modality"
  | "update-modality"
  | "delete-modality"
  | "create-submodality"
  | "update-submodality"
  | "delete-submodality";

type HandleEventModalityActionOptions = {
  allowedIntents?: EventModalityIntent[];
};

export async function handleEventModalityAction(
  request: Request,
  options: HandleEventModalityActionOptions = {},
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
    handler: modalityActionHandler,
    request,
  });
}
