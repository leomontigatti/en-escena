import { z } from "zod";

import type { RosterPersonKind } from "@/lib/roster/roster-person-status.shared";
import {
  seminarFullMessage,
  seminarStartedMessage,
} from "@/lib/seminars/registration-refusals";
import { requiredFieldMessage } from "@/lib/shared/forms";

export const registerSeminarInscriptionIntent = "register-seminar-inscription";

export const registerSeminarInscriptionSchema = z.object({
  seminarId: z.string().min(1),
  person: z.string().trim().min(1, requiredFieldMessage),
});

export type RegisterSeminarInscriptionFormValues = z.infer<
  typeof registerSeminarInscriptionSchema
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
      intent: typeof registerSeminarInscriptionIntent;
      message: string;
      status: "error" | "success";
    }
  | undefined;

/**
 * The picker is one flat list of dancers and professors, so the option value
 * has to carry which of the two a person is: two roster tables mean an id alone
 * does not say what to insert. This pair is the only encoding of that value.
 */
export function toSeminarPersonValue(person: {
  id: string;
  kind: RosterPersonKind;
}) {
  return `${person.kind}:${person.id}`;
}

export function parseSeminarPersonValue(value: string) {
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

export function getSeminarPersonKindLabel(kind: RosterPersonKind) {
  return kind === "dancer" ? "Bailarín" : "Profesor";
}

const seminarDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** The card's subtitle and the dialog's, so the two cannot word it apart. */
export function formatSeminarMoment(seminar: {
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
export function getSeminarClosedReason(seminar: {
  hasStarted: boolean;
  isFull: boolean;
}) {
  if (seminar.hasStarted) {
    return seminarStartedMessage;
  }

  return seminar.isFull ? seminarFullMessage : null;
}
