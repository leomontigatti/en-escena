import { z } from "zod";

/*
 * The date an emission goes out with (ADR-0014 §5): today unless the operator
 * back-dates it, down to the floor of the series it emits in. Shared by the
 * detail's confirmation and the bulk one, so both offer and refuse the same
 * days; the emitter checks them again under the lock.
 */

/** The days a date may take, `AAAA-MM-DD`, and what sets the floor. */
export type EmissionDateBounds = {
  floor: string;
  max: string;
  description: string;
};

// The bounds the server enforces, so a date it would refuse is caught before
// the submit; the calendar already offers no other day. With no bounds there
// is nothing to emit, and only presence is asked.
export function emissionDateSchema(bounds: EmissionDateBounds | null) {
  return z.object({
    cbteFch: z
      .string()
      .min(1, "Este campo es obligatorio.")
      .refine((value) => !bounds || value <= bounds.max, {
        message: "La fecha no puede ser posterior a hoy.",
      })
      .refine((value) => !bounds || value >= bounds.floor, {
        message: `La fecha no puede ser anterior al ${bounds?.description ?? ""}.`,
      }),
  });
}

export type EmissionDateValues = z.input<ReturnType<typeof emissionDateSchema>>;

/** The calendar's window: it opens on today and offers only the bounds' days. */
export function emissionCalendarBounds(
  today: string,
  bounds: EmissionDateBounds,
) {
  return {
    defaultMonth: parseDateOnly(today),
    startMonth: parseDateOnly(bounds.floor),
    endMonth: parseDateOnly(bounds.max),
    earliestSelectableDate: parseDateOnly(bounds.floor),
    latestSelectableDate: parseDateOnly(bounds.max),
  };
}

// A business date `AAAA-MM-DD` as the calendar's local midnight.
function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day);
}
