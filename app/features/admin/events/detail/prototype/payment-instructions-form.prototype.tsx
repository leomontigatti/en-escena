// PROTOTYPE — throwaway, lives only on branch
// `prototype/882-payment-instructions-admin`. Answers wayfinder ticket #882:
// what the admin side of `paymentInstructions` looks like on the event detail
// page, as one proposal built from primitives the repo already has.
//
// Nothing here is production code: no loader, no action, no database. The
// submit handler validates and reports, then stops.
import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { z } from "zod";

import { DateOnlyField } from "@/components/shared/date-only-field";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { TextareaField } from "@/components/shared/textarea-field";
import { FieldGroup } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MAX_REQUIRED_DEPOSIT_PERCENTAGE,
  MIN_REQUIRED_DEPOSIT_PERCENTAGE,
} from "@/lib/admin/events/form-values";
import { requiredFieldMessage } from "@/lib/shared/forms";
import { cn } from "@/lib/shared/utils";

/* ------------------------------------------------------------------ *
 * The algorithms. In the real build these live in
 * `app/lib/finances/bank-identifiers.ts`, imported by the form schema and by
 * the action — never re-implemented on the portal side (#871, point 3).
 * ------------------------------------------------------------------ */

const cbuBlockWeights = {
  bank: [7, 1, 3, 9, 7, 1, 3],
  account: [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3],
};

function hasValidBlockCheckDigit(block: string, weights: number[]) {
  const digits = [...block].map(Number);
  const checkDigit = digits.pop();
  const sum = digits.reduce(
    (total, digit, index) => total + digit * weights[index],
    0,
  );

  return (10 - (sum % 10)) % 10 === checkDigit;
}

/**
 * What is wrong with an identifier, which is not the same as "it is invalid".
 * Two failures are distinguishable and a person fixes them differently:
 *
 * - `shape` — it is not 22 digits (or 11, for a CUIT). A counting mistake.
 * - `check-digit` — it is the right length, but the digits do not agree with
 *   each other. The check digit is computed from the others, so this means one
 *   digit is mistyped or two are transposed. Nothing more.
 *
 * Neither answers whether the account exists, is open, or belongs to anyone in
 * particular — no arithmetic can, only the bank can. So the copy for these
 * never claims the number is "valid", only that it is self-consistent.
 */
export type IdentifierProblem = "shape" | "check-digit" | null;

/**
 * 22 digits, two mod-10 check digits. Takes a CBU or a CVU: the `000` prefix
 * that marks a CVU is deliberately not enforced (#869, amendment).
 */
export function checkCbu(value: string): IdentifierProblem {
  if (!/^\d{22}$/.test(value)) {
    return "shape";
  }

  const digitsAgree =
    hasValidBlockCheckDigit(value.slice(0, 8), cbuBlockWeights.bank) &&
    hasValidBlockCheckDigit(value.slice(8), cbuBlockWeights.account);

  return digitsAgree ? null : "check-digit";
}

export function isValidAlias(value: string) {
  return /^[A-Za-z0-9.-]{6,20}$/.test(value);
}

const cuitWeights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * Mod 11. Accepts `30-71234567-1` and `30712345671` alike — but when the hyphens
 * are there they have to be in the right places. A CUIT is written 2-8-1, so
 * `3-071234567-1` carries eleven digits and is still not a CUIT: the first two
 * are the tipo, and hyphens that fall elsewhere mean the person mistyped or
 * pasted something that was never a CUIT. Without hyphens there is nothing to
 * place, so the count is the whole shape.
 */
export function checkCuit(value: string): IdentifierProblem {
  const hasSeparators = value.includes("-");
  const hasValidShape = hasSeparators
    ? /^\d{2}-\d{8}-\d$/.test(value)
    : /^\d{11}$/.test(value);

  if (!hasValidShape) {
    return "shape";
  }

  const digits = value.replace(/-/g, "");

  const sum = cuitWeights.reduce(
    (total, weight, index) => total + weight * Number(digits[index]),
    0,
  );
  const remainder = 11 - (sum % 11);
  const checkDigit = remainder === 11 ? 0 : remainder;

  return checkDigit !== 10 && checkDigit === Number(digits[10])
    ? null
    : "check-digit";
}

/* ------------------------------------------------------------------ *
 * The schema. One schema for the whole event form: the instructions are
 * ordinary event fields (#871, point 3), optional with empty defaults, and the
 * group rule is a refinement over them.
 * ------------------------------------------------------------------ */

export const MAX_PAYMENT_INSTRUCTIONS_TEXT_LENGTH = 2000;

// One message per problem. The shape copy states the count and nothing else;
// the check-digit copy cannot reuse it, because by then the count is right and
// repeating "debe contener 22 dígitos" at someone who typed 22 digits reads as
// a broken form. It says the only thing a check digit proves: a digit is wrong.
//
// It names no field, so both identifiers share it: the message sits under its
// own label, which has already said which field it is.
const mistypedDigitMessage = "Alguno de los dígitos está mal tipeado.";
const cbuMessages = {
  shape: "El número de CBU/CVU debe contener 22 dígitos.",
  "check-digit": mistypedDigitMessage,
} as const;
const cuitMessages = {
  shape: "El número de CUIT debe contener 11 dígitos con o sin guiones.",
  "check-digit": mistypedDigitMessage,
} as const;
const invalidAliasMessage =
  "El alias tiene entre 6 y 20 caracteres, y solo admite letras, números, puntos y guiones.";

// REVIEWER: these two diverge from the style guide on purpose, and the PRD
// should carry the exception.
//
// `docs/agents/style-guide.md` says an empty required field must always read
// "Este campo es obligatorio.", reserving specific copy for values that are
// present but invalid. These fields are empty when the message fires, so the
// letter of the rule applies — but they are only *conditionally* required: both
// are optional until some other identifier is filled (the group rule of #869).
// "Este campo es obligatorio." on a field that was optional a second ago states
// the requirement without the condition that created it, which is exactly the
// half the admin needs.
//
// The rule reads as being about unconditionally required fields; it does not
// cover conditional groups. Resolve it one of two ways — keep this copy and
// record the exception, or amend the guide to draw the distinction — but do not
// silently "fix" these two strings back to the generic message.
const missingCbuMessage =
  "Completá el CBU/CVU para guardar los datos bancarios.";
const missingHolderNameMessage =
  "Completá el titular para guardar los datos bancarios.";
const longTextMessage = `Las instrucciones no pueden superar los ${MAX_PAYMENT_INSTRUCTIONS_TEXT_LENGTH} caracteres.`;

const optionalString = z.string().trim();

const prototypeEventFormFields = z.object({
  name: z.string().trim().min(1, requiredFieldMessage),
  requiredDepositPercentage: z.string().refine((value) => {
    const percentage = Number(value);

    return (
      value.trim().length > 0 &&
      Number.isInteger(percentage) &&
      percentage >= MIN_REQUIRED_DEPOSIT_PERCENTAGE &&
      percentage <= MAX_REQUIRED_DEPOSIT_PERCENTAGE
    );
  }, "La seña tiene que ser un porcentaje entre 0 y 100."),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, requiredFieldMessage),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, requiredFieldMessage),
  registrationStartsAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, requiredFieldMessage),
  registrationEndsAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, requiredFieldMessage),
  paymentInstructionsHolderName: optionalString,
  paymentInstructionsBankName: optionalString,
  paymentInstructionsCbu: optionalString,
  paymentInstructionsAlias: optionalString,
  paymentInstructionsHolderCuit: optionalString,
  paymentInstructionsText: optionalString.max(
    MAX_PAYMENT_INSTRUCTIONS_TEXT_LENGTH,
    longTextMessage,
  ),
});

/** The five identifiers, in the order the portal card shows them (#870). */
export const paymentInstructionsIdentifierFields = [
  "paymentInstructionsCbu",
  "paymentInstructionsAlias",
  "paymentInstructionsHolderName",
  "paymentInstructionsBankName",
  "paymentInstructionsHolderCuit",
] as const;

export const prototypeEventFormSchema = prototypeEventFormFields
  .superRefine((values, ctx) => {
    const cbuProblem = values.paymentInstructionsCbu
      ? checkCbu(values.paymentInstructionsCbu)
      : null;

    if (cbuProblem) {
      ctx.addIssue({
        code: "custom",
        message: cbuMessages[cbuProblem],
        path: ["paymentInstructionsCbu"],
      });
    }

    if (
      values.paymentInstructionsAlias &&
      !isValidAlias(values.paymentInstructionsAlias)
    ) {
      ctx.addIssue({
        code: "custom",
        message: invalidAliasMessage,
        path: ["paymentInstructionsAlias"],
      });
    }

    const cuitProblem = values.paymentInstructionsHolderCuit
      ? checkCuit(values.paymentInstructionsHolderCuit)
      : null;

    if (cuitProblem) {
      ctx.addIssue({
        code: "custom",
        message: cuitMessages[cuitProblem],
        path: ["paymentInstructionsHolderCuit"],
      });
    }

    // The group rule (#869): the text may stand alone, but the moment any
    // identifier is filled the card needs a number and a name to be worth
    // rendering.
    const hasAnyIdentifier = paymentInstructionsIdentifierFields.some(
      (field) => values[field].length > 0,
    );

    if (!hasAnyIdentifier) {
      return;
    }

    if (!values.paymentInstructionsCbu) {
      ctx.addIssue({
        code: "custom",
        message: missingCbuMessage,
        path: ["paymentInstructionsCbu"],
      });
    }

    if (!values.paymentInstructionsHolderName) {
      ctx.addIssue({
        code: "custom",
        message: missingHolderNameMessage,
        path: ["paymentInstructionsHolderName"],
      });
    }
  })
  .refine(
    (values) =>
      values.registrationStartsAt === "" ||
      values.startsAt === "" ||
      values.registrationStartsAt <= values.startsAt,
    {
      message: "No puede ser posterior a la fecha de inicio del evento.",
      path: ["registrationStartsAt"],
    },
  );

export type PrototypeEventFormValues = z.infer<typeof prototypeEventFormSchema>;

/* ------------------------------------------------------------------ *
 * The panels.
 * ------------------------------------------------------------------ */

type PrototypeEventForm = UseFormReturn<
  PrototypeEventFormValues,
  unknown,
  PrototypeEventFormValues
>;

export function usePrototypeEventForm(values: PrototypeEventFormValues) {
  const form = useForm<
    PrototypeEventFormValues,
    unknown,
    PrototypeEventFormValues
  >({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(prototypeEventFormSchema),
  });

  useEffect(() => {
    form.reset(values);
  }, [form, values]);

  return form;
}

/**
 * Unchanged from `EventFormFields`: the event's own fields stay above the
 * tabs, always visible (#871, point 1).
 */
export function PrototypeEventFields({ form }: { form: PrototypeEventForm }) {
  return (
    <FieldGroup className="grid gap-5 md:grid-cols-2">
      <TextInputField control={form.control} label="Nombre" name="name" />
      <IntegerInputField
        control={form.control}
        label="Seña (%)"
        name="requiredDepositPercentage"
        min={MIN_REQUIRED_DEPOSIT_PERCENTAGE}
        max={MAX_REQUIRED_DEPOSIT_PERCENTAGE}
        step="1"
      />
      <DateOnlyField
        control={form.control}
        label="Inicio del evento"
        name="startsAt"
      />
      <DateOnlyField
        control={form.control}
        label="Cierre del evento"
        name="endsAt"
      />
      <DateOnlyField
        control={form.control}
        label="Inicio de inscripciones"
        name="registrationStartsAt"
      />
      <DateOnlyField
        control={form.control}
        label="Cierre de inscripciones"
        name="registrationEndsAt"
      />
    </FieldGroup>
  );
}

/**
 * The panel this ticket is about: the five identifiers in the same two-column
 * grid the event fields use, then the full-width free text.
 */
export function PaymentInstructionsFields({
  form,
}: {
  form: PrototypeEventForm;
}) {
  const text = useWatch({
    control: form.control,
    name: "paymentInstructionsText",
  });
  const length = text?.length ?? 0;
  const isTooLong = length > MAX_PAYMENT_INSTRUCTIONS_TEXT_LENGTH;

  // The cap is the one rule a person can cross *while typing*, so it is the one
  // that must not wait for a submit to show itself: past 2000 the label, the
  // border and the ring go destructive through the field's own `data-invalid` /
  // `aria-invalid` states, rather than the counter turning red on its own next
  // to a field that still looks fine. The only error this field can carry is
  // this one, so clearing it unconditionally is safe.
  const { clearErrors, setError } = form;

  useEffect(() => {
    if (isTooLong) {
      setError("paymentInstructionsText", {
        message: longTextMessage,
        type: "max",
      });
    } else {
      clearErrors("paymentInstructionsText");
    }
  }, [clearErrors, isTooLong, setError]);

  return (
    <FieldGroup className="grid gap-5 md:grid-cols-2">
      <TextInputField
        control={form.control}
        label="CBU/CVU"
        name="paymentInstructionsCbu"
        autoComplete="off"
        inputMode="numeric"
        placeholder="22 dígitos"
      />
      <TextInputField
        control={form.control}
        label="Alias"
        name="paymentInstructionsAlias"
        autoComplete="off"
        placeholder="En minúscula y sin espacios"
      />
      <TextInputField
        control={form.control}
        label="Titular"
        name="paymentInstructionsHolderName"
        autoComplete="off"
      />
      <TextInputField
        control={form.control}
        label="Banco"
        name="paymentInstructionsBankName"
        autoComplete="off"
      />
      <TextInputField
        control={form.control}
        label="CUIT del titular"
        name="paymentInstructionsHolderCuit"
        autoComplete="off"
        placeholder="11 dígitos, con o sin guiones"
      />
      {/* The CUIT ends the identifier grid alone; the spacer keeps the
          textarea on its own row on wide screens. */}
      <div aria-hidden="true" className="hidden md:block" />
      <TextareaField
        control={form.control}
        className="md:col-span-2"
        label="Cómo pagar"
        name="paymentInstructionsText"
        rows={6}
        // The counter rides the existing description slot, which already sits
        // under the control: no new component, no new token.
        description={
          // `FieldDescription` sets its own muted colour, so the field's
          // `data-invalid` does not reach the counter: it says which number is
          // over the cap, so it is told separately.
          <span
            className={cn(
              "block text-right tabular-nums",
              isTooLong && "text-destructive",
            )}
          >
            {length} / {MAX_PAYMENT_INSTRUCTIONS_TEXT_LENGTH}
          </span>
        }
        placeholder="Poné el nombre de tu academia en la referencia de la transferencia."
      />
    </FieldGroup>
  );
}

export const paymentInstructionsTabValue = "instrucciones-de-pago";
export const documentsTabValue = "documentos";

/**
 * Which tab holds the first error, so a submission that fails on a hidden
 * panel can bring it forward instead of pointing at a field nobody can see
 * (#871, point 1, second condition).
 */
export function getErroredTab(form: PrototypeEventForm) {
  const errored = Object.keys(form.formState.errors);

  return errored.some((field) => field.startsWith("paymentInstructions"))
    ? paymentInstructionsTabValue
    : null;
}

export function EventFormTabs({
  documentsPanel,
  form,
}: {
  documentsPanel: React.ReactNode;
  form: PrototypeEventForm;
}) {
  // Documentos leads and lands: it is what the admin edits today, and the
  // instructions are the addition.
  const [tab, setTab] = useState<string>(documentsTabValue);
  const erroredTab = getErroredTab(form);
  const submitCount = form.formState.submitCount;

  // A failed submission pulls its tab forward. Keyed by the submit count so
  // re-submitting the same broken form switches again, and so fixing a field
  // does not yank the tab back mid-typing.
  useEffect(() => {
    if (submitCount > 0 && erroredTab) {
      setTab(erroredTab);
    }
  }, [submitCount, erroredTab]);

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList variant="line">
        <TabsTrigger value={documentsTabValue}>Documentos</TabsTrigger>
        <TabsTrigger value={paymentInstructionsTabValue}>
          Instrucciones de pago
          {erroredTab === paymentInstructionsTabValue ? (
            <TriangleAlert aria-hidden="true" className="text-destructive" />
          ) : null}
        </TabsTrigger>
      </TabsList>
      {/* `forceMount` on both, the inactive one hidden: Radix unmounts an
          inactive panel by default, and an unmounted input is not submitted —
          the instructions would post empty and clear themselves, and a PDF
          chosen in a native file input would be lost on a tab switch. */}
      <TabsContent
        forceMount
        value={documentsTabValue}
        className="pt-2 data-[state=inactive]:hidden"
      >
        {documentsPanel}
      </TabsContent>
      <TabsContent
        forceMount
        value={paymentInstructionsTabValue}
        className="pt-2 data-[state=inactive]:hidden"
      >
        <PaymentInstructionsFields form={form} />
      </TabsContent>
    </Tabs>
  );
}
