import { z } from "zod";

import {
  defaultRegisterPaymentValues,
  paymentFieldNames,
  readRegisterPaymentValues,
  registerPaymentSchema,
} from "@/features/admin/finances/academy-choreographies/shared";
import { movementKinds } from "@/lib/finances/movement-kinds";

export const createMovementIntent = "create-movement";

export const createPaymentFieldNames = [
  "academyId",
  ...paymentFieldNames,
] as const;

export type CreatePaymentFieldName = (typeof createPaymentFieldNames)[number];

export const createPaymentSchema = registerPaymentSchema.extend({
  academyId: z.string().trim().min(1, {
    message: "Seleccioná una academia.",
  }),
});

export type CreatePaymentFormValues = z.input<typeof createPaymentSchema>;
export type CreatePaymentSubmissionValues = z.output<
  typeof createPaymentSchema
>;

export const createMovementFieldNames = [
  ...createPaymentFieldNames,
  "movementKind",
] as const;

type CreateMovementFieldName = (typeof createMovementFieldNames)[number];

/**
 * A `Pago` or a `Reembolso` of an owner, chosen by `movementKind`. The two read
 * the same fields, so a refund's date and method travel in `paymentDate` and
 * `paymentMethod`, the names the shared fields carry.
 */
export const createMovementSchema = createPaymentSchema.extend({
  movementKind: z
    .string()
    .trim()
    .pipe(z.enum(movementKinds, { message: "Seleccioná un tipo." })),
});

export type CreateMovementFormValues = z.input<typeof createMovementSchema>;
export type CreateMovementSubmissionValues = z.output<
  typeof createMovementSchema
>;

export type CreateMovementActionData = {
  fieldErrors: Partial<Record<CreateMovementFieldName, string>>;
  message: string;
  status: "error";
  values: CreateMovementFormValues;
};

export function defaultCreateMovementValues(): CreateMovementFormValues {
  return {
    ...defaultRegisterPaymentValues(),
    academyId: "",
    movementKind: "payment",
  };
}

export function readCreatePaymentValues(
  formData: FormData,
): CreatePaymentFormValues {
  return {
    ...readRegisterPaymentValues(formData),
    academyId: String(formData.get("academyId") ?? "").trim(),
  };
}

export function readCreateMovementValues(
  formData: FormData,
): CreateMovementFormValues {
  return {
    ...readCreatePaymentValues(formData),
    movementKind: String(formData.get("movementKind") ?? "").trim(),
  };
}
