import type { ActionData } from "@/lib/admin/events/bases-action/shared.server";
import type { modalities } from "@/db/schema";
import type { ScheduleListItem } from "@/lib/events/bases.server";

export type EventScheduleActionData = ActionData;

export type EventScheduleModalityRow = typeof modalities.$inferSelect;

export type EventSchedulesListLoaderData = {
  selectedEventId: string | null;
  schedules: ScheduleListItem[];
};

export type EventScheduleFormLoaderData = {
  selectedEventId: string | null;
  modalities: EventScheduleModalityRow[];
};

export type EventScheduleDetailLoaderData = EventSchedulesListLoaderData &
  EventScheduleFormLoaderData;

export type EventSchedulesLoaderData = EventScheduleDetailLoaderData;

const basePath = "/administracion/cronogramas";

export { basePath };
