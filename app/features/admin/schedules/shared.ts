import type { ActionData } from "@/lib/admin/events/bases-action/shared.server";
import type { categories, modalities } from "@/db/schema";
import type { ScheduleListItem } from "@/lib/events/bases.server";

export type EventScheduleActionData = ActionData;

export type EventScheduleModalityRow = typeof modalities.$inferSelect;

/**
 * A category of the event as the schedule form reads it: its modalities say
 * whether the schedule could ever place it, and its age range and group types
 * are what tell two categories of the same name apart.
 */
export type EventScheduleCategoryRow = Pick<
  typeof categories.$inferSelect,
  "id" | "name" | "minAge" | "maxAge" | "groupTypes"
> & {
  modalityIds: string[];
};

export type EventSchedulesListLoaderData = {
  selectedEventId: string | null;
  schedules: ScheduleListItem[];
};

export type EventScheduleFormLoaderData = {
  selectedEventId: string | null;
  modalities: EventScheduleModalityRow[];
  categories: EventScheduleCategoryRow[];
};

export type EventScheduleDetailLoaderData = EventSchedulesListLoaderData &
  EventScheduleFormLoaderData;

export type EventSchedulesLoaderData = EventScheduleDetailLoaderData;

const basePath = "/administracion/cronogramas";

export { basePath };
