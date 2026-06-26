import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId } from "react";
import { Controller, useForm, type Control } from "react-hook-form";

import { SubmitButton } from "@/components/shared/action-buttons";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  createValidatedReactRouterSubmitHandler,
  type ReactRouterFormSubmit,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import {
  createDancerIntent,
  createDancerSchema,
  emptyDancerFieldErrors,
  emptyDancerValues,
  type CreateDancerActionData,
  type CreateDancerFormValues,
} from "@/features/portal/dancers/create/shared";

export function CreateDancerDialog({
  actionData,
  isOpen,
  isSubmitting,
  onOpenChange,
  submit,
}: {
  actionData?: CreateDancerActionData;
  isOpen: boolean;
  isSubmitting: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  submit: ReactRouterFormSubmit;
}) {
  const firstNameId = useId();
  const lastNameId = useId();
  const birthDateId = useId();
  const form = useForm<CreateDancerFormValues>({
    resolver: zodResolver(createDancerSchema),
    defaultValues: actionData?.values ?? emptyDancerValues,
  });
  const serverFieldErrors = actionData?.fieldErrors ?? emptyDancerFieldErrors;

  useEffect(() => {
    form.reset(actionData?.values ?? emptyDancerValues);
  }, [actionData?.values, form]);

  useApplyServerFieldErrors(form, serverFieldErrors);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Nuevo bailarín</DialogTitle>
          <DialogDescription>
            Ingresá los datos mínimos para cargarlo en la academia.
          </DialogDescription>
        </DialogHeader>

        <form
          method="post"
          onSubmit={createValidatedReactRouterSubmitHandler(form, submit, {
            method: "post",
          })}
          className="flex flex-col gap-5"
        >
          <input type="hidden" name="intent" value={createDancerIntent} />
          <FieldGroup>
            <DancerTextField
              control={form.control}
              fieldName="firstName"
              id={firstNameId}
              label="Nombre"
              autoComplete="given-name"
              serverError={serverFieldErrors.firstName}
            />

            <DancerTextField
              control={form.control}
              fieldName="lastName"
              id={lastNameId}
              label="Apellido"
              autoComplete="family-name"
              serverError={serverFieldErrors.lastName}
            />

            <Controller
              control={form.control}
              name="birthDate"
              render={({ field, fieldState }) => {
                const errorMessage =
                  fieldState.error?.message ?? serverFieldErrors.birthDate;

                return (
                  <DateOnlyField
                    id={birthDateId}
                    label="Fecha de nacimiento"
                    name={field.name}
                    defaultValue={field.value}
                    value={field.value}
                    onBlur={field.onBlur}
                    onValueChange={field.onChange}
                    error={errorMessage}
                    endMonth={new Date()}
                    startMonth={new Date(1900, 0)}
                  />
                );
              }}
            />
          </FieldGroup>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton isPending={isSubmitting} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DancerTextField({
  autoComplete,
  control,
  fieldName,
  id,
  label,
  serverError,
}: {
  autoComplete: string;
  control: Control<CreateDancerFormValues>;
  fieldName: keyof CreateDancerFormValues;
  id: string;
  label: string;
  serverError?: string;
}) {
  return (
    <Controller
      control={control}
      name={fieldName}
      render={({ field, fieldState }) => {
        const errorMessage = fieldState.error?.message ?? serverError;
        const isInvalid = Boolean(errorMessage);

        return (
          <Field data-invalid={isInvalid ? true : undefined}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <FieldContent>
              <Input
                {...field}
                id={id}
                autoComplete={autoComplete}
                aria-invalid={isInvalid ? true : undefined}
              />
              <FieldError>{errorMessage}</FieldError>
            </FieldContent>
          </Field>
        );
      }}
    />
  );
}
