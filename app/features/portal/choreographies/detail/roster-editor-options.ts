import type { ResolveChoreographyDancersResult } from "@/lib/portal/choreography-roster.server";

export function getSelectableScheduleOptions(
  scheduleResolution:
    | Extract<
        ResolveChoreographyDancersResult,
        { ok: true }
      >["resolution"]["schedule"]
    | null,
) {
  if (!scheduleResolution || scheduleResolution.status === "none") {
    return [];
  }

  return scheduleResolution.options;
}

export function formatPersonName(person: {
  firstName: string;
  lastName: string;
}) {
  return `${person.firstName} ${person.lastName}`;
}

export function formatScheduleOptionDateTime(option: {
  schedule: {
    name: string;
    scheduledDate?: string;
    startTime?: string;
  };
}) {
  const { scheduledDate, startTime } = option.schedule;

  if (!scheduledDate || !startTime) {
    return option.schedule.name;
  }

  const [year, month, day] = scheduledDate.split("-").map(Number);

  if (!year || !month || !day) {
    return option.schedule.name;
  }

  const date = new Date(year, month - 1, day);
  const formattedDate = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

  return `${formattedDate} - ${startTime.slice(0, 5)} hs.`;
}

export function getSelectionKey(ids: string[]) {
  return [...ids].sort().join("|");
}
