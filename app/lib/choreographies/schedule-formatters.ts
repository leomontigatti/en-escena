export type ScheduleDateTimeInput = {
  name: string;
  scheduledDate: string;
  startTime: string;
};

export function formatScheduleDateTime(input: ScheduleDateTimeInput) {
  const [year, month, day] = input.scheduledDate.split("-").map(Number);

  if (!year || !month || !day) {
    return input.name;
  }

  const date = new Date(year, month - 1, day);
  const formattedDate = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const formattedTime = input.startTime.slice(0, 5);

  return `${formattedDate} - ${formattedTime} hs.`;
}

/**
 * Occupancy is composed as a suffix and only where *options* are built: the same
 * `formatScheduleDateTime` labels the already assigned schedule, where saying how
 * many places are left means nothing.
 *
 * A capacity can look like it has room and be full anyway because the schedule
 * containing it is exhausted, so "sin cupo" is appended separately from the count
 * rather than deduced from it.
 */
export function appendScheduleOccupancySuffix(
  label: string,
  occupancy: { capacity: number; isFull: boolean; occupiedCount: number },
) {
  const suffix = `${occupancy.occupiedCount}/${occupancy.capacity} ocupados`;

  return occupancy.isFull
    ? `${label} · ${suffix} · sin cupo`
    : `${label} · ${suffix}`;
}
