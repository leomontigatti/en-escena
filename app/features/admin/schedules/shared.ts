import type { ActionData } from "@/lib/admin/events/bases-action/shared.server";
import type { modalities } from "@/db/schema";
import type { ScheduleListItem } from "@/lib/events/bases.server";

export type AdministrativeEventScheduleActionData = ActionData;

export type EventScheduleModalityRow = typeof modalities.$inferSelect;

export type AdministrativeEventSchedulesListLoaderData = {
  selectedEventId: string | null;
  schedules: ScheduleListItem[];
};

export type AdministrativeEventScheduleFormLoaderData = {
  selectedEventId: string | null;
  modalities: EventScheduleModalityRow[];
};

export type AdministrativeEventScheduleDetailLoaderData =
  AdministrativeEventSchedulesListLoaderData &
    AdministrativeEventScheduleFormLoaderData;

export type AdministrativeEventSchedulesLoaderData =
  AdministrativeEventScheduleDetailLoaderData;

const basePath = "/administracion/cronogramas";

export { basePath };
