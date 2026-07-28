import { modalityActionHandler } from "@/lib/admin/events/bases-action/modalities.server";
import { runSelectedEventBasesAction } from "@/lib/admin/events/bases-action/route.server";
import { type ActionData } from "@/lib/admin/events/bases-action/shared.server";

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
  return runSelectedEventBasesAction({
    allowedIntents: options.allowedIntents,
    handler: modalityActionHandler,
    request,
  });
}
