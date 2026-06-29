import type {
  CreateEventInput,
  EventMutationResult,
} from "@/lib/events/management.server";

import type { events as eventsTable } from "@/db/schema";
import {
  BUSINESS_TIME_ZONE,
  BUSINESS_TIME_ZONE_UTC_OFFSET,
} from "@/lib/shared/business-time-zone";
import {
  MAX_REQUIRED_DEPOSIT_PERCENTAGE,
  MIN_REQUIRED_DEPOSIT_PERCENTAGE,
  DEFAULT_REQUIRED_DEPOSIT_PERCENTAGE,
  invalidRequiredDepositPercentageMessage,
} from "@/lib/events/deposit-percentage";
import { requiredFieldMessage } from "@/lib/shared/forms";
import { z } from "zod";

export type EventRow = typeof eventsTable.$inferSelect;

export type FieldErrors = NonNullable<
  Extract<EventMutationResult, { ok: false }>["fieldErrors"]
>;

export { MAX_REQUIRED_DEPOSIT_PERCENTAGE, MIN_REQUIRED_DEPOSIT_PERCENTAGE };

export const eventFormSchema = z.object({
  name: z.string().trim().min(1, requiredFieldMessage),
  registrationStartsAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, requiredFieldMessage),
  registrationEndsAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, requiredFieldMessage),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, requiredFieldMessage),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, requiredFieldMessage),
  requiredDepositPercentage: z.string().refine((value) => {
    const percentage = Number(value);

    return (
      value.trim().length > 0 &&
      Number.isInteger(percentage) &&
      percentage >= MIN_REQUIRED_DEPOSIT_PERCENTAGE &&
      percentage <= MAX_REQUIRED_DEPOSIT_PERCENTAGE
    );
  }, invalidRequiredDepositPercentageMessage),
});

export type EventFormValues = z.infer<typeof eventFormSchema>;

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
  const parsedValues = eventFormSchema.safeParse(values);

  if (!parsedValues.success) {
    return {
      ok: false,
      fieldErrors: parsedValues.error.issues.reduce<FieldErrors>(
        (fieldErrors, issue) => {
          const fieldName = issue.path[0];

          if (typeof fieldName === "string") {
            fieldErrors[fieldName as keyof FieldErrors] = issue.message;
          }

          return fieldErrors;
        },
        {},
      ),
    };
  }

  const registrationStartsAt = parseBusinessDate(values.registrationStartsAt);
  const registrationEndsAt = parseBusinessDate(values.registrationEndsAt);
  const startsAt = parseBusinessDate(values.startsAt);
  const endsAt = parseBusinessDate(values.endsAt);
  const requiredDepositPercentage = Number(values.requiredDepositPercentage);

  if (!registrationStartsAt || !registrationEndsAt || !startsAt || !endsAt) {
    return {
      ok: false,
      fieldErrors: {
        registrationStartsAt: registrationStartsAt
          ? undefined
          : requiredFieldMessage,
        registrationEndsAt: registrationEndsAt
          ? undefined
          : requiredFieldMessage,
        startsAt: startsAt ? undefined : requiredFieldMessage,
        endsAt: endsAt ? undefined : requiredFieldMessage,
      },
    };
  }

  return {
    ok: true,
    input: {
      name: parsedValues.data.name,
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
    requiredDepositPercentage: String(DEFAULT_REQUIRED_DEPOSIT_PERCENTAGE),
  };
}

export function eventFormValues(event: EventRow): EventFormValues {
  return {
    name: event.name,
    registrationStartsAt: formatBusinessDateInput(event.registrationStartsAt),
    registrationEndsAt: formatBusinessDateInput(event.registrationEndsAt),
    startsAt: formatBusinessDateInput(event.startsAt),
    endsAt: formatBusinessDateInput(event.endsAt),
    requiredDepositPercentage: String(event.requiredDepositPercentage),
  };
}

function parseBusinessDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00${BUSINESS_TIME_ZONE_UTC_OFFSET}`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatBusinessDateInput(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const valueByType = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${valueByType.year}-${valueByType.month}-${valueByType.day}`;
}
