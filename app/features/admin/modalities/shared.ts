import type { ActionData } from "@/lib/admin/events/bases-action/shared.server";
import type { OfferedSheets } from "@/lib/judging/sheet-criteria";
import type {
  modalities,
  submodalities,
  submodalityCriteria,
} from "@/db/schema";

export type EventModalityActionData = ActionData;

export type EventModalityRow = typeof modalities.$inferSelect;
export type EventSubmodalityRow = typeof submodalities.$inferSelect;
export type EventSubmodalityCriterionRow =
  typeof submodalityCriteria.$inferSelect;

export type EventModalitiesLoaderData = {
  selectedEventId: string | null;
  modalities: EventModalityRow[];
  submodalities: EventSubmodalityRow[];
  submodalityCriteria: EventSubmodalityCriterionRow[];
  lockedSubmodalityIds: string[];
  /** The sheets each modality is scored on, keyed by modality. */
  modalitySheets: Record<string, OfferedSheets>;
};

const basePath = "/administracion/modalidades";

export { basePath };
