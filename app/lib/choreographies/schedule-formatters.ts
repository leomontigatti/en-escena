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
 * La ocupación se compone como sufijo y solo donde se arman *opciones*: el
 * mismo `formatScheduleDateTime` rotula el cronograma ya asignado, donde
 * decir cuántos lugares quedan no significa nada.
 *
 * Un cupo puede verse con lugar y estar lleno igual porque el cronograma que
 * lo contiene se agotó, así que "sin cupo" se agrega aparte de la cuenta en
 * lugar de deducirse de ella.
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
