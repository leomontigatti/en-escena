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

type ReactRouterFormSubmission = Record<string, string>;

export type ReactRouterFormSubmit = (
  target: HTMLFormElement | ReactRouterFormSubmission,
  options?: ReactRouterSubmitOptions,
) => void;

function createReactRouterFormSubmission<TFieldValues extends FieldValues>(
  formElement: HTMLFormElement,
  values: TFieldValues,
): ReactRouterFormSubmission {
  const submission: ReactRouterFormSubmission = {};

  for (const [fieldName, fieldValue] of new FormData(formElement).entries()) {
    submission[fieldName] = String(fieldValue);
  }

  for (const [fieldName, fieldValue] of Object.entries(values)) {
    if (typeof fieldValue === "string") {
      submission[fieldName] = fieldValue;
      continue;
    }

    submission[fieldName] = String(fieldValue ?? "");
  }

  return submission;
}

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
      submit(
        createReactRouterFormSubmission(formElement, values),
        submitOptions,
      );
    };

    void form.handleSubmit(submitRouterForm)(event);
  };
}
