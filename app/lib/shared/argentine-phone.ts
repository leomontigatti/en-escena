import { z } from "zod";

import { requiredFieldMessage } from "@/lib/shared/forms";

export const argentinePhonePlaceholder = "Código de área sin 0 y número sin 15";
export const invalidArgentinePhoneMessage =
  "Ingresá 10 dígitos, sin espacios, 0 ni 15.";

const argentinePhonePattern = /^\d{10}$/;

export function isValidArgentinePhone(value: string) {
  return argentinePhonePattern.test(value);
}

export function argentinePhoneField() {
  return z.string().superRefine((value, context) => {
    if (!value.trim()) {
      context.addIssue({
        code: "custom",
        message: requiredFieldMessage,
      });
      return;
    }

    if (!argentinePhonePattern.test(value)) {
      context.addIssue({
        code: "custom",
        message: invalidArgentinePhoneMessage,
      });
    }
  });
}
