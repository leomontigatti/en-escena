import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId } from "react";
import {
  Controller,
  type Path,
  type Resolver,
  type SubmitHandler,
  useForm,
} from "react-hook-form";
import type {
  DefaultValues,
  FieldValues,
  UseFormReturn,
} from "react-hook-form";
import type { ZodTypeAny } from "zod";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useApplyServerFieldErrors } from "@/lib/shared/forms";

type ServerFieldErrors = Partial<Record<string, string>>;

export type AccessFormController<TFieldValues extends FieldValues> = {
  form: UseFormReturn<TFieldValues, unknown, TFieldValues>;
  handleSubmit: (event: React.SubmitEvent<HTMLFormElement>) => void;
};

export function useAccessForm<TFieldValues extends FieldValues>({
  schema,
  values,
  fieldErrors = {},
}: {
  schema: ZodTypeAny;
  values: DefaultValues<TFieldValues>;
  fieldErrors?: ServerFieldErrors;
}): AccessFormController<TFieldValues> {
  const form = useForm<TFieldValues, unknown, TFieldValues>({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(schema as never) as Resolver<
      TFieldValues,
      unknown,
      TFieldValues
    >,
  });
  const valuesKey = JSON.stringify(values);

  useEffect(() => {
    form.reset(values);
  }, [form, values, valuesKey]);

  useApplyServerFieldErrors(form, fieldErrors);

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const submitNativeForm: SubmitHandler<TFieldValues> = () => {
      formElement.submit();
    };

    void form.handleSubmit(submitNativeForm)(event);
  }

  return { form, handleSubmit };
}

export function AccessTextField<TFieldValues extends FieldValues>({
  controller,
  label,
  name,
  description,
  ...inputProps
}: {
  controller: AccessFormController<TFieldValues>;
  label: string;
  name: Path<TFieldValues>;
  description?: React.ReactNode;
} & Omit<
  React.ComponentProps<typeof Input>,
  "name" | "value" | "defaultValue" | "onChange" | "onBlur"
>) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = `${id}-error`;

  return (
    <Controller
      control={controller.form.control}
      name={name}
      render={({ field, fieldState }) => {
        const describedBy = [
          descriptionId,
          fieldState.error ? errorId : undefined,
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <Field data-invalid={fieldState.error ? true : undefined}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <FieldContent>
              {description ? (
                <FieldDescription id={descriptionId}>
                  {description}
                </FieldDescription>
              ) : null}
              <Input
                {...inputProps}
                {...field}
                id={id}
                aria-describedby={describedBy || undefined}
                aria-invalid={fieldState.error ? true : undefined}
              />
              <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        );
      }}
    />
  );
}
