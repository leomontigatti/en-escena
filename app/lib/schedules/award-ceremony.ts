/**
 * A schedule's award ceremony is one value held in two fields, a date and a
 * time: the schedule either has both or neither. The admin form and the
 * repository refuse a half-set pair with the same message, from here, and the
 * database refuses it again (`schedule_award_ceremony_both_or_neither`).
 * See CONTEXT.md `awardCeremony`.
 */

export const halfSetAwardCeremonyMessage =
  "Completá la fecha y la hora de la entrega de premios, o dejá las dos vacías.";

export type AwardCeremonyField = "awardCeremonyDate" | "awardCeremonyTime";

/**
 * The half of the pair that is missing when exactly one is filled, which is
 * where the administrator has to act; `null` when the pair is whole or empty.
 * Blank text counts as empty, as it does on every other field of the form.
 */
export function findMissingAwardCeremonyField({
  awardCeremonyDate,
  awardCeremonyTime,
}: {
  awardCeremonyDate?: string | null;
  awardCeremonyTime?: string | null;
}): AwardCeremonyField | null {
  const hasDate = Boolean(awardCeremonyDate?.trim());
  const hasTime = Boolean(awardCeremonyTime?.trim());

  if (hasDate === hasTime) {
    return null;
  }

  return hasDate ? "awardCeremonyTime" : "awardCeremonyDate";
}
