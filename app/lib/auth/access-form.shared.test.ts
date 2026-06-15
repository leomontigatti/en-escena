import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
  emailField,
  passwordField,
  requiredTextField,
} from "@/lib/auth/access-form.shared";
import { getFieldErrors } from "@/lib/shared/form-validation";
import { requiredFieldMessage } from "@/lib/shared/forms";

describe("access form shared validation", () => {
  test("uses the shared required message for empty required fields", () => {
    const schema = z.object({
      email: emailField(),
      password: passwordField(),
      name: requiredTextField(),
    });

    const result = schema.safeParse({
      email: "",
      password: "",
      name: "",
    });

    expect(result.success).toBe(false);
    expect(
      getFieldErrors(result.error!, ["email", "password", "name"] as const),
    ).toEqual({
      email: requiredFieldMessage,
      password: requiredFieldMessage,
      name: requiredFieldMessage,
    });
  });

  test("keeps specific messages for invalid email and short passwords", () => {
    const schema = z.object({
      email: emailField(),
      password: passwordField(),
    });

    const result = schema.safeParse({
      email: "invalido",
      password: "1234567",
    });

    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors).toEqual({
      email: ["Ingresá un correo electrónico válido."],
      password: ["La contraseña debe tener al menos 8 caracteres."],
    });
  });
});
