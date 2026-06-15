import { useEffect } from "react";
import type { SubmitEventHandler } from "react";
import type {
  FieldPath,
  FieldValues,
  SubmitHandler,
  UseFormReturn,
} from "react-hook-form";

export const requiredFieldMessage = "Este campo es obligatorio.";

type ServerFieldErrors = Partial<Record<string, string>>;
type ServerFieldNameResolver<TFieldValues extends FieldValues> = (
  fieldName: string,
) => FieldPath<TFieldValues> | null;

export function applyServerFieldErrors<TFieldValues extends FieldValues>(
  form: Pick<UseFormReturn<TFieldValues>, "setError">,
  fieldErrors: ServerFieldErrors,
  resolveFieldName?: ServerFieldNameResolver<TFieldValues>,
) {
  for (const [fieldName, message] of Object.entries(fieldErrors)) {
    if (!message) {
      continue;
    }

    let resolvedFieldName: FieldPath<TFieldValues> | null;

    if (resolveFieldName) {
      resolvedFieldName = resolveFieldName(fieldName);
    } else {
      resolvedFieldName = fieldName as FieldPath<TFieldValues>;
    }

    if (!resolvedFieldName) {
      continue;
    }

    form.setError(resolvedFieldName, {
      message,
      type: "server",
    });
  }
}

export function useApplyServerFieldErrors<TFieldValues extends FieldValues>(
  form: Pick<UseFormReturn<TFieldValues>, "setError">,
  fieldErrors: ServerFieldErrors,
  resolveFieldName?: ServerFieldNameResolver<TFieldValues>,
) {
  useEffect(() => {
    applyServerFieldErrors(form, fieldErrors, resolveFieldName);
  }, [fieldErrors, form, resolveFieldName]);
}

export function createValidatedNativeSubmitHandler<
  TFieldValues extends FieldValues,
>(
  form: Pick<UseFormReturn<TFieldValues>, "handleSubmit">,
): SubmitEventHandler<HTMLFormElement> {
  return (event) => {
    event.preventDefault();

    const formElement = event.currentTarget;
    const submitNativeForm: SubmitHandler<TFieldValues> = () => {
      formElement.submit();
    };

    void form.handleSubmit(submitNativeForm)(event);
  };
}
