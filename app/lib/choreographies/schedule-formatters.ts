export type ScheduleDateTimeInput = {
  name: string;
  scheduledDate: string;
  startTime: string;
};

type ScheduleDateTimeFormatOptions = {
  includeName?: boolean;
};

export function formatScheduleDateTime(
  input: ScheduleDateTimeInput,
  options: ScheduleDateTimeFormatOptions = {},
) {
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

  if (options.includeName) {
    return `${input.name} · ${formattedDate} · ${formattedTime} hs.`;
  }

  return `${formattedDate} - ${formattedTime} hs.`;
}
