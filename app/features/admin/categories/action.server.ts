import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { categoryActionHandler } from "@/lib/admin/events/bases-action/categories.server";
import { runEventBasesActionWithHandler } from "@/lib/admin/events/bases-action/runner.server";
import { type ActionData } from "@/lib/admin/events/bases-action/shared.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import { getCategory } from "@/lib/categories/repository.server";

type CategoryIntent = "create-category" | "update-category" | "delete-category";

type HandleCategoryActionOptions = {
  allowedIntents?: CategoryIntent[];
  recordId?: string;
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

  if (options.recordId !== undefined) {
    const category = await getCategory(eventId, options.recordId);

    if (!category) {
      return {
        status: "error",
        message: "No encontramos esa categoría dentro del evento activo.",
        fieldErrors: {},
        scope: null,
      };
    }
  }

  return runEventBasesActionWithHandler({
    allowedIntents: options.allowedIntents,
    eventId,
    handler: categoryActionHandler,
    recordId: options.recordId,
    request,
  });
}
