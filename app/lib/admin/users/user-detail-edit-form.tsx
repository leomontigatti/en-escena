import { zodResolver } from "@hookform/resolvers/zod";
import { Check } from "lucide-react";
import {
  useEffect,
  useId,
  type FormEvent,
  type InputHTMLAttributes,
} from "react";
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
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  LockedUserField,
  UserFormCard,
} from "@/lib/admin/users/user-detail-cards";
import { InternalUserEditRoleField } from "@/lib/admin/users/user-detail-role-field";
import {
  buildUpdateInternalUserFormValues,
  emptyUpdateInternalUserFieldErrors,
  updateInternalUserSchema,
  type DetailActionData,
  type DetailUser,
  type UpdateInternalUserField,
  type UpdateInternalUserFormValues,
} from "@/lib/admin/users/user-detail.shared";
import { useApplyServerFieldErrors } from "@/lib/shared/forms";

export function InternalUserEditCard({
  actionData,
  cancelHref,
  user,
}: {
  actionData?: DetailActionData;
  cancelHref: string;
  user: DetailUser;
}) {
  const formValues =
    actionData?.editValues ?? buildUpdateInternalUserFormValues(user);
  const form = useForm<
    UpdateInternalUserFormValues,
    unknown,
    UpdateInternalUserFormValues
  >({
    defaultValues: formValues,
    mode: "onSubmit",
    resolver: zodResolver(updateInternalUserSchema),
  });

  useEffect(() => {
    form.reset(formValues);
  }, [form, formValues.email, formValues.name, formValues.role]);

  useApplyServerFieldErrors(
    form,
    actionData?.form === "edit"
      ? actionData.fieldErrors
      : emptyUpdateInternalUserFieldErrors,
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const submitNativeForm: SubmitHandler<
      UpdateInternalUserFormValues
    > = () => {
      formElement.submit();
    };

    void form.handleSubmit(submitNativeForm)(event);
  }

  return (
    <form method="post" noValidate onSubmit={handleSubmit}>
      <UserFormCard
        footer={
          <>
            <Button asChild variant="outline">
              <Link to={cancelHref}>Volver</Link>
            </Button>
            <Button type="submit">
              <Check aria-hidden="true" data-icon="inline-start" />
              Guardar
            </Button>
          </>
        }
      >
        <InternalUserEditTextField
          autoComplete="name"
          control={form.control}
          label="Nombre"
          name="name"
        />
        <LockedUserField
          label="Nombre de usuario interno"
          value={user.identifier}
        />
        <InternalUserEditTextField
          autoComplete="email"
          control={form.control}
          label="Correo"
          name="email"
          type="email"
        />
        <InternalUserEditRoleField control={form.control} />
      </UserFormCard>
    </form>
  );
}

function InternalUserEditTextField({
  autoComplete,
  control,
  description,
  label,
  name,
  type = "text",
}: {
  autoComplete?: string;
  control: Control<UpdateInternalUserFormValues>;
  description?: string;
  label: string;
  name: UpdateInternalUserField;
  type?: InputHTMLAttributes<HTMLInputElement>["type"];
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller<UpdateInternalUserFormValues, UpdateInternalUserField>
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Input
            id={id}
            aria-describedby={fieldState.error ? errorId : undefined}
            aria-invalid={fieldState.error ? true : undefined}
            autoComplete={autoComplete}
            type={type}
            {...field}
            value={field.value ?? ""}
          />
          {description ? (
            <FieldDescription>{description}</FieldDescription>
          ) : null}
          <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
        </Field>
      )}
    />
  );
}
