import { data } from "react-router";
import type { z } from "zod";

import { redirectSignedInUserFromPublicRoute } from "@/lib/auth/internal-navigation.server";
import {
  getEmptyFieldErrors,
  getFieldErrors,
  type FieldErrors,
} from "@/lib/shared/form-validation";

export type PublicAccessFormResult<
  FieldName extends string,
  Values extends Record<string, string>,
> = {
  status: "success" | "error";
  message: string;
  fieldErrors: FieldErrors<FieldName>;
  values: Values;
};

const invalidFormMessage = "Revisá los campos marcados.";

export async function loadPublicAccessRoute(request: Request) {
  const publicRouteInit = await redirectSignedInUserFromPublicRoute(request);

  return data(null, publicRouteInit ?? undefined);
}

export function buildPublicAccessFormError<
  FieldName extends string,
  Values extends Record<string, string>,
>({
  error,
  fieldNames,
  values,
}: {
  error: z.ZodError;
  fieldNames: readonly FieldName[];
  values: Values;
}): PublicAccessFormResult<FieldName, Values> {
  return {
    status: "error",
    message: invalidFormMessage,
    fieldErrors: getFieldErrors(error, fieldNames),
    values,
  };
}

export function buildPublicAccessFormSuccess<
  FieldName extends string,
  Values extends Record<string, string>,
>({
  message,
  values,
  headers,
}: {
  message: string;
  values: Values;
  headers?: HeadersInit;
}) {
  return data(
    {
      status: "success" as const,
      message,
      fieldErrors: getEmptyFieldErrors<FieldName>(),
      values,
    } satisfies PublicAccessFormResult<FieldName, Values>,
    headers ? { headers } : undefined,
  );
}
