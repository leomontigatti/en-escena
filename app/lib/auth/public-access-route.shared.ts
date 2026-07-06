import { data, type Navigation } from "react-router";
import type { z } from "zod";

import { readFormValue } from "@/lib/auth/access-form.shared";
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

type ParsePublicAccessFormResult<
  Schema extends z.ZodTypeAny,
  FieldName extends string,
> =
  | {
      ok: true;
      data: z.output<Schema>;
      values: Record<FieldName, string>;
    }
  | {
      ok: false;
      response: PublicAccessFormResult<FieldName, Record<FieldName, string>>;
    };

type PublicAccessFormValues<FieldName extends string> = Record<
  FieldName,
  string
>;

export async function parsePublicAccessForm<
  Schema extends z.ZodTypeAny,
  FieldName extends string,
>({
  request,
  schema,
  fieldNames,
  preservedValueFields = fieldNames,
}: {
  request: Request;
  schema: Schema;
  fieldNames: readonly FieldName[];
  preservedValueFields?: readonly FieldName[];
}): Promise<ParsePublicAccessFormResult<Schema, FieldName>> {
  const formData = await request.formData();
  const values = getPublicAccessFormValues({
    formData,
    fieldNames,
    preservedValueFields,
  });
  const parsed = schema.safeParse(
    getPublicAccessFormInput(formData, fieldNames),
  );

  if (!parsed.success) {
    return {
      ok: false,
      response: buildPublicAccessFormError({
        error: parsed.error,
        fieldNames,
        values,
      }),
    };
  }

  return {
    ok: true,
    data: parsed.data,
    values,
  };
}

function getPublicAccessFormValues<FieldName extends string>({
  formData,
  fieldNames,
  preservedValueFields,
}: {
  formData: FormData;
  fieldNames: readonly FieldName[];
  preservedValueFields: readonly FieldName[];
}): PublicAccessFormValues<FieldName> {
  const preservedFieldNameSet = new Set<FieldName>(preservedValueFields);

  return Object.fromEntries(
    fieldNames.map((fieldName) => [
      fieldName,
      preservedFieldNameSet.has(fieldName)
        ? readFormValue(formData.get(fieldName))
        : "",
    ]),
  ) as PublicAccessFormValues<FieldName>;
}

function getPublicAccessFormInput<FieldName extends string>(
  formData: FormData,
  fieldNames: readonly FieldName[],
) {
  return Object.fromEntries(
    fieldNames.map((fieldName) => [fieldName, formData.get(fieldName)]),
  );
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

export function getPublicAccessResultToastId({
  status,
  successToastId,
  errorToastId,
}: {
  status: "success" | "error" | undefined;
  successToastId: string;
  errorToastId: string;
}) {
  return status === "success" ? successToastId : errorToastId;
}

export function isPublicAccessFormSubmitting(
  navigation: Pick<Navigation, "state" | "formMethod">,
) {
  return (
    navigation.state !== "idle" &&
    navigation.formMethod?.toLowerCase() === "post"
  );
}
