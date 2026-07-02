import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { categoryActionHandler } from "@/lib/admin/events/bases-action/categories.server";
import { runEventBasesActionWithHandler } from "@/lib/admin/events/bases-action/runner.server";
import { type ActionData } from "@/lib/admin/events/bases-action/shared.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";

type CategoryIntent = "create-category" | "update-category" | "delete-category";

type HandleCategoryActionOptions = {
  allowedIntents?: CategoryIntent[];
};

export async function handleCategoryAction(
  request: Request,
  options: HandleCategoryActionOptions = {},
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
    handler: categoryActionHandler,
    request,
  });
}
