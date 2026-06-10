import type { z } from "zod";

export type FieldErrors<FieldName extends string> = Partial<
  Record<FieldName, string>
>;

export function getFieldErrors<FieldName extends string>(
  error: z.ZodError,
  fieldNames: readonly FieldName[],
) {
  const fieldNameSet = new Set<string>(fieldNames);
  const fieldErrors: FieldErrors<FieldName> = {};

  for (const issue of error.issues) {
    const fieldName = issue.path[0];

    if (
      typeof fieldName === "string" &&
      fieldNameSet.has(fieldName) &&
      !fieldErrors[fieldName as FieldName]
    ) {
      fieldErrors[fieldName as FieldName] = issue.message;
    }
  }

  return fieldErrors;
}

export function getFirstFieldError<FieldName extends string>(
  fieldErrors: FieldErrors<FieldName>,
  fallback: string,
) {
  return Object.values(fieldErrors)[0] ?? fallback;
}
