import { useEffect } from "react";
import type { SubmitEventHandler } from "react";
import type {
  FieldPath,
  FieldValues,
  SubmitHandler,
  UseFormReturn,
} from "react-hook-form";

export const requiredFieldMessage = "Este campo es obligatorio.";

export type ServerFieldErrors = Partial<Record<string, string>>;
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

type ReactRouterSubmitOptions = {
  method?: "delete" | "get" | "patch" | "post" | "put";
};

export type ReactRouterFormSubmit = (
  target: HTMLFormElement | Record<string, string>,
  options?: ReactRouterSubmitOptions,
) => void;

export function createValidatedReactRouterSubmitHandler<
  TFieldValues extends FieldValues,
>(
  form: Pick<UseFormReturn<TFieldValues>, "handleSubmit">,
  submit: ReactRouterFormSubmit,
  submitOptions?: ReactRouterSubmitOptions,
): SubmitEventHandler<HTMLFormElement> {
  return (event) => {
    const formElement = event.currentTarget;
    const submitRouterForm: SubmitHandler<TFieldValues> = (values) => {
      const submission = Object.fromEntries(
        new FormData(formElement).entries(),
      ) as Record<string, string>;

      for (const [fieldName, fieldValue] of Object.entries(values)) {
        submission[fieldName] =
          typeof fieldValue === "string"
            ? fieldValue
            : String(fieldValue ?? "");
      }

      submit(submission, submitOptions);
    };

    void form.handleSubmit(submitRouterForm)(event);
  };
}
