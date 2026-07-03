import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, type ComponentProps, type ReactNode } from "react";
import { type Path, type Resolver, useForm } from "react-hook-form";
import type {
  DefaultValues,
  FieldValues,
  UseFormReturn,
} from "react-hook-form";
import { useSubmit } from "react-router";
import type { ZodTypeAny } from "zod";

import { TextInputField } from "@/components/shared/text-input-field";
import { createValidatedRouteSubmitHandler } from "@/lib/shared/forms";

export type AccessFormController<TFieldValues extends FieldValues> = {
  form: UseFormReturn<TFieldValues, unknown, TFieldValues>;
  handleSubmit: (event: React.SubmitEvent<HTMLFormElement>) => void;
};

export function useAccessForm<TFieldValues extends FieldValues>({
  schema,
  values,
}: {
  schema: ZodTypeAny;
  values: DefaultValues<TFieldValues>;
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
  const resetKey = JSON.stringify(values);

  useEffect(() => {
    form.reset(values);
  }, [form, resetKey]);

  const submit = useSubmit();
  const handleSubmit = createValidatedRouteSubmitHandler(form, submit);

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
  description?: ReactNode;
} & Omit<
  ComponentProps<"input">,
  "name" | "value" | "defaultValue" | "onChange" | "onBlur"
>) {
  return (
    <TextInputField
      control={controller.form.control}
      description={description}
      label={label}
      name={name}
      {...inputProps}
    />
  );
}
