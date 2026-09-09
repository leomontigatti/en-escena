import { z } from "zod";

import type { RosterPersonKind } from "@/lib/roster/roster-person-status.shared";
import {
  seminarFullMessage,
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

export type RegisterPortalSeminarInscriptionFormValues = z.infer<
  typeof registerPortalSeminarInscriptionSchema
>;

export type PortalSeminarPersonOption = {
  id: string;
  kind: RosterPersonKind;
  fullName: string;
};

export type PortalSeminarInscription = {
  id: string;
  fullName: string;
};

export type PortalSeminarCard = {
  id: string;
  instructorName: string;
  instructorPictureUrl: string | null;
  scheduledDate: string;
  startTime: string;
  hasStarted: boolean;
  isFull: boolean;
  inscriptions: PortalSeminarInscription[];
  people: PortalSeminarPersonOption[];
};

export type PortalSeminarsListLoaderData = {
  hasActiveEvent: boolean;
  seminars: PortalSeminarCard[];
};

export type PortalSeminarsActionData =
  | {
      intent:
        | typeof deletePortalSeminarInscriptionIntent
        | typeof registerPortalSeminarInscriptionIntent;
      message: string;
      status: "error" | "success";
    }
  | undefined;

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
 * The heading of each section of the picker. Plural because it titles a group
 * rather than qualifying one person: the kind is said once, above the names,
 * instead of being repeated as a suffix on every option.
 */
function getPortalSeminarPersonKindGroupLabel(kind: RosterPersonKind) {
  return kind === "dancer" ? "Bailarines" : "Profesores";
}

/**
 * The picker's sections, in the order they are shown, with the empty ones
 * dropped: an academy without professors must not see a heading over nothing.
 * Order inside a section is the loader's, which is already by name.
 */
export function toPortalSeminarPersonGroups(
  people: PortalSeminarPersonOption[],
) {
  const kinds: RosterPersonKind[] = ["dancer", "professor"];

  return kinds
    .map((kind) => ({
      label: getPortalSeminarPersonKindGroupLabel(kind),
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

/** The card's subtitle and the dialog's, so the two cannot word it apart. */
export function formatPortalSeminarMoment(seminar: {
  scheduledDate: string;
  startTime: string;
}) {
  return `${seminarDateFormatter.format(
    new Date(`${seminar.scheduledDate}T00:00:00Z`),
  )} · ${seminar.startTime}`;
}

/**
 * The two reasons a footer holds a sentence instead of the button. "Started"
 * wins over "full": once it has begun, the quota stopped being the question.
 */
export function getPortalSeminarClosedReason(seminar: {
  hasStarted: boolean;
  isFull: boolean;
}) {
  if (seminar.hasStarted) {
    return seminarStartedMessage;
  }

  return seminar.isFull ? seminarFullMessage : null;
}
