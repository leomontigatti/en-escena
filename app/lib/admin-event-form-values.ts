import type {
  CreateEventInput,
  EventMutationResult,
} from "./event-management.server";

import type { events as eventsTable } from "@/db/schema";

export type EventRow = typeof eventsTable.$inferSelect;

export type FieldErrors = NonNullable<
  Extract<EventMutationResult, { ok: false }>["fieldErrors"]
>;

export type EventFormValues = Record<keyof CreateEventInput, string>;

export const DEFAULT_REQUIRED_DEPOSIT_PERCENTAGE = "30";
export const MIN_REQUIRED_DEPOSIT_PERCENTAGE = 0;
export const MAX_REQUIRED_DEPOSIT_PERCENTAGE = 100;

export function readEventFormValues(formData: FormData): EventFormValues {
  return {
    name: String(formData.get("name") ?? ""),
    registrationStartsAt: String(formData.get("registrationStartsAt") ?? ""),
    registrationEndsAt: String(formData.get("registrationEndsAt") ?? ""),
    startsAt: String(formData.get("startsAt") ?? ""),
    endsAt: String(formData.get("endsAt") ?? ""),
    requiredDepositPercentage: String(
      formData.get("requiredDepositPercentage") ??
        DEFAULT_REQUIRED_DEPOSIT_PERCENTAGE,
    ),
  };
}

export function parseEventFormValues(
  values: EventFormValues,
):
  | { ok: true; input: CreateEventInput }
  | { ok: false; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  const registrationStartsAt = parseArgentinaDateTime(
    values.registrationStartsAt,
  );
  const registrationEndsAt = parseArgentinaDateTime(values.registrationEndsAt);
  const startsAt = parseArgentinaDateTime(values.startsAt);
  const endsAt = parseArgentinaDateTime(values.endsAt);
  const requiredDepositPercentage = Number(values.requiredDepositPercentage);

  if (values.name.trim().length === 0) {
    fieldErrors.name = "Ingresá el nombre del Evento.";
  }

  if (!registrationStartsAt) {
    fieldErrors.registrationStartsAt = "Ingresá el inicio de inscripción.";
  }

  if (!registrationEndsAt) {
    fieldErrors.registrationEndsAt = "Ingresá el cierre de inscripción.";
  }

  if (!startsAt) {
    fieldErrors.startsAt = "Ingresá el inicio del Evento.";
  }

  if (!endsAt) {
    fieldErrors.endsAt = "Ingresá el cierre del Evento.";
  }

  if (
    values.requiredDepositPercentage.trim().length === 0 ||
    !Number.isInteger(requiredDepositPercentage) ||
    requiredDepositPercentage < MIN_REQUIRED_DEPOSIT_PERCENTAGE ||
    requiredDepositPercentage > MAX_REQUIRED_DEPOSIT_PERCENTAGE
  ) {
    fieldErrors.requiredDepositPercentage =
      "La seña requerida debe ser un entero entre 0 y 100.";
  }

  if (
    Object.keys(fieldErrors).length > 0 ||
    !registrationStartsAt ||
    !registrationEndsAt ||
    !startsAt ||
    !endsAt
  ) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    input: {
      name: values.name,
      registrationStartsAt,
      registrationEndsAt,
      startsAt,
      endsAt,
      requiredDepositPercentage,
    },
  };
}

export function defaultEventFormValues(): EventFormValues {
  return {
    name: "",
    registrationStartsAt: "",
    registrationEndsAt: "",
    startsAt: "",
    endsAt: "",
    requiredDepositPercentage: DEFAULT_REQUIRED_DEPOSIT_PERCENTAGE,
  };
}

export function eventFormValues(event: EventRow): EventFormValues {
  return {
    name: event.name,
    registrationStartsAt: formatArgentinaDateTimeInput(
      event.registrationStartsAt,
    ),
    registrationEndsAt: formatArgentinaDateTimeInput(event.registrationEndsAt),
    startsAt: formatArgentinaDateTimeInput(event.startsAt),
    endsAt: formatArgentinaDateTimeInput(event.endsAt),
    requiredDepositPercentage: String(event.requiredDepositPercentage),
  };
}

function parseArgentinaDateTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}:00-03:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatArgentinaDateTimeInput(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const valueByType = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${valueByType.year}-${valueByType.month}-${valueByType.day}T${valueByType.hour}:${valueByType.minute}`;
}
