import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, type FormEvent } from "react";
import {
  Controller,
  type Control,
  type SubmitHandler,
  useForm,
} from "react-hook-form";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UserFormCard } from "@/lib/admin/users/user-detail-cards";
import {
  emptyResetPasswordFieldErrors,
  emptyResetPasswordValues,
  resetPasswordIntent,
  resetPasswordSchema,
  type DetailActionData,
  type ResetPasswordFormValues,
} from "@/lib/admin/users/user-detail.shared";
import { useApplyServerFieldErrors } from "@/lib/shared/forms";

export function InternalUserResetPasswordCard({
  actionData,
  cancelHref,
}: {
  actionData?: DetailActionData;
  cancelHref: string;
}) {
  const formValues =
    actionData?.resetPasswordValues ?? emptyResetPasswordValues;
  const form = useForm<
    ResetPasswordFormValues,
    unknown,
    ResetPasswordFormValues
  >({
    defaultValues: formValues,
    mode: "onSubmit",
    resolver: zodResolver(resetPasswordSchema),
  });

  useEffect(() => {
    form.reset(formValues);
  }, [form, formValues.temporaryPassword]);

  useApplyServerFieldErrors(
    form,
    actionData?.form === "reset-password"
      ? actionData.resetPasswordFieldErrors
      : emptyResetPasswordFieldErrors,
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const submitNativeForm: SubmitHandler<ResetPasswordFormValues> = () => {
      formElement.submit();
    };

    void form.handleSubmit(submitNativeForm)(event);
  }

  return (
    <form method="post" noValidate onSubmit={handleSubmit}>
      <UserFormCard
        title="Restablecimiento administrativo de contraseña"
        footer={
          <>
            <Button type="submit">Guardar contraseña temporal</Button>
            <Button asChild variant="outline">
              <Link to={cancelHref}>Cancelar</Link>
            </Button>
          </>
        }
      >
        <input type="hidden" name="intent" value={resetPasswordIntent} />
        <div className="md:col-span-2">
          <InternalUserResetPasswordField control={form.control} />
        </div>
      </UserFormCard>
    </form>
  );
}

function InternalUserResetPasswordField({
  control,
}: {
  control: Control<ResetPasswordFormValues>;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller<ResetPasswordFormValues, "temporaryPassword">
      control={control}
      name="temporaryPassword"
      render={({ field, fieldState }) => (
        <Field
          data-invalid={fieldState.error ? true : undefined}
          orientation="responsive"
        >
          <FieldLabel htmlFor={id}>Contraseña temporal</FieldLabel>
          <FieldContent>
            <Input
              id={id}
              aria-describedby={fieldState.error ? errorId : undefined}
              aria-invalid={fieldState.error ? true : undefined}
              autoComplete="new-password"
              type="password"
              {...field}
              value={field.value ?? ""}
            />
            <FieldDescription>
              Compartila por un canal seguro. El Usuario deberá cambiarla antes
              de volver a ingresar a su área privada.
            </FieldDescription>
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}
