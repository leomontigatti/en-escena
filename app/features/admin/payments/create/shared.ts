import { z } from "zod";

import {
  defaultRegisterPaymentValues,
  paymentFieldNames,
  readRegisterPaymentValues,
  registerPaymentSchema,
} from "@/features/admin/academies/account-current/shared";

export const createPaymentIntent = "create-payment";

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

export type CreatePaymentActionData = {
  fieldErrors: Partial<Record<CreatePaymentFieldName, string>>;
  message: string;
  status: "error";
  values: CreatePaymentFormValues;
};

export function defaultCreatePaymentValues(): CreatePaymentFormValues {
  return {
    ...defaultRegisterPaymentValues(),
    academyId: "",
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
