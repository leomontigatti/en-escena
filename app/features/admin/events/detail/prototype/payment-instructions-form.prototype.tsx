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
 * 22 digits, two mod-10 check digits. Takes a CBU or a CVU: the `000` prefix
 * that marks a CVU is deliberately not enforced (#869, amendment).
 */
export function isValidCbu(value: string) {
  return (
    /^\d{22}$/.test(value) &&
    hasValidBlockCheckDigit(value.slice(0, 8), cbuBlockWeights.bank) &&
    hasValidBlockCheckDigit(value.slice(8), cbuBlockWeights.account)
  );
}

export function isValidAlias(value: string) {
  return /^[A-Za-z0-9.-]{6,20}$/.test(value);
}

const cuitWeights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Mod 11. Accepts `30-71234567-1` and `30712345671` alike. */
export function isValidCuit(value: string) {
  const digits = value.replace(/[\s-]/g, "");

  if (!/^\d{11}$/.test(digits)) {
    return false;
  }

  const sum = cuitWeights.reduce(
    (total, weight, index) => total + weight * Number(digits[index]),
    0,
  );
  const remainder = 11 - (sum % 11);
  const checkDigit = remainder === 11 ? 0 : remainder;

  return checkDigit !== 10 && checkDigit === Number(digits[10]);
}

/* ------------------------------------------------------------------ *
 * The schema. One schema for the whole event form: the instructions are
 * ordinary event fields (#871, point 3), optional with empty defaults, and the
 * group rule is a refinement over them.
 * ------------------------------------------------------------------ */

export const MAX_PAYMENT_INSTRUCTIONS_TEXT_LENGTH = 2000;

const invalidCbuMessage =
  "El CBU/CVU tiene que tener 22 dígitos y ser un número válido.";
const invalidAliasMessage =
  "El alias tiene entre 6 y 20 caracteres, y solo admite letras, números, puntos y guiones.";
const invalidCuitMessage = "El CUIT no es válido. Revisá los 11 dígitos.";
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
    if (
      values.paymentInstructionsCbu &&
      !isValidCbu(values.paymentInstructionsCbu)
    ) {
      ctx.addIssue({
        code: "custom",
        message: invalidCbuMessage,
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

    if (
      values.paymentInstructionsHolderCuit &&
      !isValidCuit(values.paymentInstructionsHolderCuit)
    ) {
      ctx.addIssue({
        code: "custom",
        message: invalidCuitMessage,
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

  return (
    <FieldGroup className="grid gap-5 md:grid-cols-2">
      <TextInputField
        control={form.control}
        label="CBU/CVU"
        name="paymentInstructionsCbu"
        autoComplete="off"
        inputMode="numeric"
        // The 22 digits read as one run on the portal card, and they read the
        // same way here: the field the admin proof-reads against home banking
        // is the field they typed into.
        inputClassName="font-mono tabular-nums"
        placeholder="0070099330004512345678"
      />
      <TextInputField
        control={form.control}
        label="Alias"
        name="paymentInstructionsAlias"
        autoComplete="off"
        placeholder="en.escena.pagos"
      />
      <TextInputField
        control={form.control}
        label="Titular"
        name="paymentInstructionsHolderName"
        autoComplete="off"
        placeholder="En Escena Producciones SRL"
      />
      <TextInputField
        control={form.control}
        label="Banco"
        name="paymentInstructionsBankName"
        autoComplete="off"
        placeholder="Banco Galicia"
      />
      <TextInputField
        control={form.control}
        label="CUIT del titular"
        name="paymentInstructionsHolderCuit"
        autoComplete="off"
        inputClassName="font-mono tabular-nums"
        placeholder="30-71234567-1"
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
          <span
            className={
              length > MAX_PAYMENT_INSTRUCTIONS_TEXT_LENGTH
                ? "block text-right tabular-nums text-destructive"
                : "block text-right tabular-nums"
            }
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
  const [tab, setTab] = useState<string>(paymentInstructionsTabValue);
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
        <TabsTrigger value={paymentInstructionsTabValue}>
          Instrucciones de pago
          {erroredTab === paymentInstructionsTabValue ? (
            <TriangleAlert aria-hidden="true" className="text-destructive" />
          ) : null}
        </TabsTrigger>
        <TabsTrigger value={documentsTabValue}>Documentos</TabsTrigger>
      </TabsList>
      {/* `forceMount` on both, the inactive one hidden: Radix unmounts an
          inactive panel by default, and an unmounted input is not submitted —
          the instructions would post empty and clear themselves, and a PDF
          chosen in a native file input would be lost on a tab switch. */}
      <TabsContent
        forceMount
        value={paymentInstructionsTabValue}
        className="pt-2 data-[state=inactive]:hidden"
      >
        <PaymentInstructionsFields form={form} />
      </TabsContent>
      <TabsContent
        forceMount
        value={documentsTabValue}
        className="pt-2 data-[state=inactive]:hidden"
      >
        {documentsPanel}
      </TabsContent>
    </Tabs>
  );
}
