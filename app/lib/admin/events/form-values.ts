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
import {
  validateAlias,
  validateCbu,
  validateCuit,
} from "@/lib/finances/bank-identifiers";
import { requiredFieldMessage } from "@/lib/shared/forms";
import { z } from "zod";

export type EventRow = typeof eventsTable.$inferSelect;

export type FieldErrors = NonNullable<
  Extract<EventMutationResult, { ok: false }>["fieldErrors"]
>;

export { MAX_REQUIRED_DEPOSIT_PERCENTAGE, MIN_REQUIRED_DEPOSIT_PERCENTAGE };

export const registrationAfterEventStartMessage =
  "No puede ser posterior a la fecha de inicio del evento.";

const PAYMENT_INSTRUCTIONS_TEXT_MAX_LENGTH = 2000;

/**
 * REVIEWER: `missingCbu` and `missingHolderName` diverge from the style guide's
 * `Este campo es obligatorio.` on purpose, and the divergence is specified in
 * PRD #895. These two fields are *conditionally* required — nothing is required
 * until another identifier is filled — and the generic sentence would state the
 * requirement without the condition that created it. Keep the specific copy.
 *
 * `mistypedDigit` names no field because it renders under its own `FieldLabel`,
 * and no message here calls a number "valid" or "inválido": a check digit only
 * proves that a digit is mistyped or two are transposed. Whether the account
 * exists is a question only the payer's home banking answers.
 */
export const paymentInstructionsMessages = {
  missingCbu: "Completá el CBU/CVU para guardar los datos bancarios.",
  missingHolderName: "Completá el titular para guardar los datos bancarios.",
  cbuLength: "El número de CBU/CVU debe contener 22 dígitos.",
  cuitShape: "El número de CUIT debe contener 11 dígitos con o sin guiones.",
  mistypedDigit: "Alguno de los dígitos está mal tipeado.",
  alias:
    "El alias tiene entre 6 y 20 caracteres, y solo admite letras, números, puntos y guiones.",
  textLength: `Las instrucciones no pueden superar los ${PAYMENT_INSTRUCTIONS_TEXT_MAX_LENGTH} caracteres.`,
} as const;

/**
 * The five bank identifiers, in the order the group rule reads them. The free
 * text is not one of them: it can stand alone.
 */
const paymentInstructionsIdentifierFields = [
  "paymentInstructionsCbu",
  "paymentInstructionsAlias",
  "paymentInstructionsHolderName",
  "paymentInstructionsBankName",
  "paymentInstructionsHolderCuit",
] as const;

const paymentInstructionsFields = [
  ...paymentInstructionsIdentifierFields,
  "paymentInstructionsText",
] as const;

type PaymentInstructionsField = (typeof paymentInstructionsFields)[number];

const eventFormFields = z.object({
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
  // Ordinary optional event fields: the create page keeps posting what it
  // posts today, and an absent or empty field means NULL.
  paymentInstructionsCbu: optionalIdentifier((value) => {
    switch (validateCbu(value)) {
      case "ok":
        return undefined;
      case "wrong-length":
        return paymentInstructionsMessages.cbuLength;
      case "mistyped-digit":
        return paymentInstructionsMessages.mistypedDigit;
    }
  }),
  paymentInstructionsAlias: optionalIdentifier((value) =>
    validateAlias(value) === "ok"
      ? undefined
      : paymentInstructionsMessages.alias,
  ),
  paymentInstructionsHolderName: z.string(),
  paymentInstructionsBankName: z.string(),
  paymentInstructionsHolderCuit: optionalIdentifier((value) => {
    switch (validateCuit(value)) {
      case "ok":
        return undefined;
      case "wrong-shape":
        return paymentInstructionsMessages.cuitShape;
      case "mistyped-digit":
        return paymentInstructionsMessages.mistypedDigit;
    }
  }),
  paymentInstructionsText: z.string().superRefine((value, context) => {
    if (value.trim().length > PAYMENT_INSTRUCTIONS_TEXT_MAX_LENGTH) {
      context.addIssue({
        code: "custom",
        message: paymentInstructionsMessages.textLength,
      });
    }
  }),
});

/**
 * An identifier left empty raises nothing — the group rule below is what makes
 * one of them required. When it is filled, `check` names the single thing that
 * is wrong with it: one issue per field, so the field error the form shows is
 * never the second of two competing messages.
 */
function optionalIdentifier(check: (value: string) => string | undefined) {
  return z.string().superRefine((value, context) => {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return;
    }

    const message = check(trimmed);

    if (message) {
      context.addIssue({ code: "custom", message });
    }
  });
}

/**
 * Inscriptions that open after the event starts are a typo, not a
 * configuration: the check lives in the schema so the same rule reaches the
 * field through `zodResolver` and the action through `parseEventFormValues`.
 */
export const eventFormSchema = eventFormFields
  .superRefine(addPaymentInstructionsGroupIssues)
  .refine(
    (values) =>
      values.registrationStartsAt === "" ||
      values.startsAt === "" ||
      values.registrationStartsAt <= values.startsAt,
    {
      message: registrationAfterEventStartMessage,
      path: ["registrationStartsAt"],
    },
  );

/**
 * The bank identifiers are a group: an alias alone cannot be paid into, and a
 * number without a holder cannot be checked against what the payer's bank
 * shows before confirming. So as soon as any identifier is filled, the CBU/CVU
 * and the holder become required — both at once when neither is there, one
 * message per field.
 */
function addPaymentInstructionsGroupIssues(
  values: z.infer<typeof eventFormFields>,
  context: z.RefinementCtx,
) {
  const hasAnyIdentifier = paymentInstructionsIdentifierFields.some(
    (field) => values[field].trim().length > 0,
  );

  if (!hasAnyIdentifier) {
    return;
  }

  const required = [
    ["paymentInstructionsCbu", paymentInstructionsMessages.missingCbu],
    [
      "paymentInstructionsHolderName",
      paymentInstructionsMessages.missingHolderName,
    ],
  ] as const;

  for (const [field, message] of required) {
    if (values[field].trim().length === 0) {
      context.addIssue({ code: "custom", message, path: [field] });
    }
  }
}

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
    ...readPaymentInstructionsFormValues(formData),
  };
}

function readPaymentInstructionsFormValues(formData: FormData) {
  return Object.fromEntries(
    paymentInstructionsFields.map((field) => [
      field,
      String(formData.get(field) ?? ""),
    ]),
  ) as Record<PaymentInstructionsField, string>;
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
      // The alias is stored lowercased; every other field keeps what was
      // typed, trimmed. An empty field is NULL, never "".
      paymentInstructionsCbu: storedOrNull(
        parsedValues.data.paymentInstructionsCbu,
      ),
      paymentInstructionsAlias: storedOrNull(
        parsedValues.data.paymentInstructionsAlias.toLowerCase(),
      ),
      paymentInstructionsHolderName: storedOrNull(
        parsedValues.data.paymentInstructionsHolderName,
      ),
      paymentInstructionsBankName: storedOrNull(
        parsedValues.data.paymentInstructionsBankName,
      ),
      paymentInstructionsHolderCuit: storedOrNull(
        parsedValues.data.paymentInstructionsHolderCuit,
      ),
      paymentInstructionsText: storedOrNull(
        parsedValues.data.paymentInstructionsText,
      ),
    },
  };
}

function storedOrNull(value: string) {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

export function getEventFormErrorMessage(
  fieldErrors: FieldErrors,
  fallback: string,
) {
  return Object.values(fieldErrors).find((message) => message) ?? fallback;
}

export function defaultEventFormValues(): EventFormValues {
  return {
    name: "",
    registrationStartsAt: "",
    registrationEndsAt: "",
    startsAt: "",
    endsAt: "",
    requiredDepositPercentage: String(DEFAULT_REQUIRED_DEPOSIT_PERCENTAGE),
    ...emptyPaymentInstructionsFormValues(),
  };
}

function emptyPaymentInstructionsFormValues() {
  return Object.fromEntries(
    paymentInstructionsFields.map((field) => [field, ""]),
  ) as Record<PaymentInstructionsField, string>;
}

export function eventFormValues(event: EventRow): EventFormValues {
  return {
    name: event.name,
    registrationStartsAt: formatBusinessDateInput(event.registrationStartsAt),
    registrationEndsAt: formatBusinessDateInput(event.registrationEndsAt),
    startsAt: formatBusinessDateInput(event.startsAt),
    endsAt: formatBusinessDateInput(event.endsAt),
    requiredDepositPercentage: String(event.requiredDepositPercentage),
    ...(Object.fromEntries(
      paymentInstructionsFields.map((field) => [field, event[field] ?? ""]),
    ) as Record<PaymentInstructionsField, string>),
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
