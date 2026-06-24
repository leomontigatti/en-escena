import { useEffect } from "react";
import type { SubmitEventHandler } from "react";
import type {
  FieldPath,
  FieldValues,
  SubmitHandler,
  UseFormReturn,
} from "react-hook-form";
import { useFormAction, useNavigation, useSubmit } from "react-router";
import type {
  FormEncType,
  HTMLFormMethod,
  SubmitFunction,
  SubmitTarget,
} from "react-router";

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
  encType?: FormEncType;
  method?: "delete" | "get" | "patch" | "post" | "put";
};

export type ReactRouterFormSubmit = (
  target: HTMLFormElement | FormData,
  options?: ReactRouterSubmitOptions,
) => void;

function createReactRouterFormSubmission<TFieldValues extends FieldValues>(
  formElement: HTMLFormElement,
  values: TFieldValues,
): FormData {
  const submission = new FormData(formElement);

  for (const [fieldName, fieldValue] of Object.entries(values)) {
    submission.set(fieldName, String(fieldValue ?? ""));
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

export function useOptionalFormAction() {
  try {
    return useFormAction();
  } catch {
    return undefined;
  }
}

export function useOptionalSubmit() {
  try {
    return useSubmit();
  } catch {
    return async () => {};
  }
}

export function useOptionalNavigation() {
  try {
    return useNavigation();
  } catch {
    return { state: "idle" } as const;
  }
}

export type RouteFormPendingScope = {
  intent: string;
  fields?: Record<string, string>;
};

export function createValidatedRouteSubmitHandler<
  TFieldValues extends FieldValues,
>(
  form: Pick<UseFormReturn<TFieldValues>, "handleSubmit">,
  submit: SubmitFunction,
  action?: string,
): SubmitEventHandler<HTMLFormElement> {
  return (event) => {
    event.preventDefault();

    const formElement = event.currentTarget;
    const submitTarget = getRouteSubmitTarget(event);

    const submitRouteForm: SubmitHandler<TFieldValues> = () => {
      submit(submitTarget, {
        action: action ?? getFormActionPath(formElement),
        encType: formElement.enctype as FormEncType,
        method: formElement.method as HTMLFormMethod,
      });
    };

    void form.handleSubmit(submitRouteForm)(event);
  };
}

export function isRouteFormPending(
  navigation: {
    formData?: FormData | null;
    formMethod?: string | null;
    state: string;
  },
  scope: RouteFormPendingScope,
) {
  if (
    navigation.state === "idle" ||
    navigation.formMethod?.toLowerCase() !== "post" ||
    navigation.formData?.get("intent") !== scope.intent
  ) {
    return false;
  }

  for (const [fieldName, expectedValue] of Object.entries(scope.fields ?? {})) {
    if (navigation.formData.get(fieldName) !== expectedValue) {
      return false;
    }
  }

  return true;
}

function getRouteSubmitTarget(
  event: Parameters<SubmitEventHandler<HTMLFormElement>>[0],
): SubmitTarget {
  let submitter: SubmitEvent["submitter"] = null;

  if (
    typeof SubmitEvent !== "undefined" &&
    event.nativeEvent instanceof SubmitEvent
  ) {
    submitter = event.nativeEvent.submitter;
  }

  if (
    submitter instanceof HTMLButtonElement ||
    submitter instanceof HTMLInputElement
  ) {
    return submitter;
  }

  return event.currentTarget;
}

function getFormActionPath(formElement: HTMLFormElement) {
  const actionUrl = new URL(formElement.action);

  return `${actionUrl.pathname}${actionUrl.search}`;
}
