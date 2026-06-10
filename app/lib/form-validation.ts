import type { z } from "zod";

export type FieldErrors<FieldName extends string> = Partial<
  Record<FieldName, string>
>;

export function getFieldErrors<FieldName extends string>(
  error: z.ZodError,
  fieldNames: readonly FieldName[],
): FieldErrors<FieldName> {
  const fieldNameSet = new Set<FieldName>(fieldNames);
  const fieldErrors: FieldErrors<FieldName> = {};

  for (const issue of error.issues) {
    const fieldName = issue.path[0];

    if (
      isFieldName(fieldName, fieldNameSet) &&
      fieldErrors[fieldName] === undefined
    ) {
      fieldErrors[fieldName] = issue.message;
    }
  }

  return fieldErrors;
}

export function getEmptyFieldErrors<
  FieldName extends string,
>(): FieldErrors<FieldName> {
  return {};
}

function isFieldName<FieldName extends string>(
  value: unknown,
  fieldNameSet: ReadonlySet<FieldName>,
): value is FieldName {
  return typeof value === "string" && fieldNameSet.has(value as FieldName);
}
