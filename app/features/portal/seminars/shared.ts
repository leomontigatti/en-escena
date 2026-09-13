import { z } from "zod";

import type { RosterPersonKind } from "@/lib/roster/roster-person-status.shared";
import {
  seminarPricesMissingMessage,
  seminarStartedMessage,
} from "@/lib/seminars/registration-refusals";
import { requiredFieldMessage } from "@/lib/shared/forms";

export const registerPortalSeminarInscriptionIntent =
  "register-seminar-inscription";
export const deletePortalSeminarInscriptionIntent =
  "delete-seminar-inscription";

export const registerPortalSeminarInscriptionSchema = z.object({
  seminarId: z.string().min(1),
  person: z.string().trim().min(1, requiredFieldMessage),
});

export type RegisterPortalSeminarInscriptionFormValues = z.input<
  typeof registerPortalSeminarInscriptionSchema
>;

export type PortalSeminarPersonOption = {
  id: string;
  kind: RosterPersonKind;
  fullName: string;
};

/** The path of one seminar's academy-facing detail, said once so the card's
 * link and the tests cannot word it apart. */
export function portalSeminarDetailPath(seminarId: string) {
  return `/portal/seminarios/${seminarId}`;
}

/**
 * The picker draws from dancers and professors alike, so the option value has
 * to carry which of the two a person is: two roster tables mean an id alone
 * does not say what to insert. This pair is the only encoding of that value,
 * and it is what the section a person is shown under cannot replace — the
 * heading is presentation, the value is what the form submits.
 */
export function toPortalSeminarPersonValue(person: {
  id: string;
  kind: RosterPersonKind;
}) {
  return `${person.kind}:${person.id}`;
}

export function parsePortalSeminarPersonValue(value: string) {
  const [kind, ...rest] = value.split(":");
  const personId = rest.join(":");

  if ((kind !== "dancer" && kind !== "professor") || personId.length === 0) {
    return null;
  }

  return { kind, personId } satisfies {
    kind: RosterPersonKind;
    personId: string;
  };
}

/**
 * The heading of each section of the picker, in the order the sections are
 * shown. Plural because it titles a group rather than qualifying one person:
 * the kind is said once, above the names, instead of being repeated as a
 * suffix on every option.
 */
const portalSeminarPersonGroupLabels: Record<RosterPersonKind, string> = {
  dancer: "Bailarines",
  professor: "Profesores",
};

/**
 * The picker's sections, in the order they are shown, with the empty ones
 * dropped: an academy without professors must not see a heading over nothing.
 * Order inside a section is the loader's, which is already by name.
 */
export function toPortalSeminarPersonGroups(
  people: PortalSeminarPersonOption[],
) {
  return Object.entries(portalSeminarPersonGroupLabels)
    .map(([kind, label]) => ({
      label,
      options: people
        .filter((person) => person.kind === kind)
        .map((person) => ({
          label: person.fullName,
          value: toPortalSeminarPersonValue(person),
        })),
    }))
    .filter((group) => group.options.length > 0);
}

const seminarDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** The poster's subtitle, the detail's and the dialog's, so the three cannot
 * word it apart. */
export function formatPortalSeminarMoment(seminar: {
  scheduledDate: string;
  startTime: string;
}) {
  return `${seminarDateFormatter.format(
    new Date(`${seminar.scheduledDate}T00:00:00Z`),
  )} · ${seminar.startTime}`;
}

/**
 * How many inscriptions the academy holds in a seminar, as the poster's one
 * badge reads it. The gallery says nothing else about a seminar's occupancy:
 * the quota is spent by deposits, on administration's side.
 */
export function formatPortalSeminarInscriptionCount(count: number) {
  if (count === 0) {
    return "Sin inscriptos";
  }

  return count === 1 ? "1 inscripto" : `${count} inscriptos`;
}

/**
 * The two reasons the seminar detail closes registration, in the order they are
 * read. **A full seminar is not one of them**: registration is unlimited and
 * the quota is spent by deposits, so an academy registers whoever it wants and
 * the refusal, if any, lands on administration's allocation
 * (docs/domain/seminars.md, "The place") — a full seminar says so in a notice
 * of its own instead. "Started" wins over the missing price list: once it has
 * begun, what it would have cost is not the question.
 */
export function getPortalSeminarClosedReason(seminar: {
  hasStarted: boolean;
  hasRegistrationPrices: boolean;
}) {
  if (seminar.hasStarted) {
    return seminarStartedMessage;
  }

  return seminar.hasRegistrationPrices ? null : seminarPricesMissingMessage;
}
