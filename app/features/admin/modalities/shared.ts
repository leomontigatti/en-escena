import type { ActionData } from "@/lib/admin/events/bases-action/shared.server";
import type { modalities, submodalities } from "@/db/schema";

export type AdministrativeEventModalityActionData = ActionData;

export type EventModalityRow = typeof modalities.$inferSelect;
export type EventSubmodalityRow = typeof submodalities.$inferSelect;

export type AdministrativeEventModalitiesLoaderData = {
  selectedEventId: string | null;
  modalities: EventModalityRow[];
  submodalities: EventSubmodalityRow[];
};

const basePath = "/administracion/modalidades";

export { basePath };
