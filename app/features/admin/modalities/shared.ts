import type { ActionData } from "@/lib/admin/events/bases-action/shared.server";
import type { modalities, submodalities } from "@/db/schema";

export type EventModalityActionData = ActionData;

export type EventModalityRow = typeof modalities.$inferSelect;
export type EventSubmodalityRow = typeof submodalities.$inferSelect;

export type EventModalitiesLoaderData = {
  selectedEventId: string | null;
  modalities: EventModalityRow[];
  submodalities: EventSubmodalityRow[];
};

const basePath = "/administracion/modalidades";

export { basePath };
