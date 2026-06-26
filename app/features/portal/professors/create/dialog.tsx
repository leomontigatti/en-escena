import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId } from "react";
import { Controller, useForm, type Control } from "react-hook-form";

import { SubmitButton } from "@/components/shared/action-buttons";
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
  createProfessorIntent,
  createProfessorSchema,
  emptyProfessorFieldErrors,
  emptyProfessorValues,
  type CreateProfessorActionData,
  type CreateProfessorFormValues,
} from "@/features/portal/professors/create/shared";

export function CreateProfessorDialog({
  actionData,
  isOpen,
  isSubmitting,
  onOpenChange,
  submit,
}: {
  actionData?: CreateProfessorActionData;
  isOpen: boolean;
  isSubmitting: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  submit: ReactRouterFormSubmit;
}) {
  const firstNameId = useId();
  const lastNameId = useId();
  const form = useForm<CreateProfessorFormValues>({
    resolver: zodResolver(createProfessorSchema),
    defaultValues: actionData?.values ?? emptyProfessorValues,
  });
  const serverFieldErrors =
    actionData?.fieldErrors ?? emptyProfessorFieldErrors;

  useEffect(() => {
    form.reset(actionData?.values ?? emptyProfessorValues);
  }, [actionData?.values, form]);

  useApplyServerFieldErrors(form, serverFieldErrors);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Nuevo profesor</DialogTitle>
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
          <input type="hidden" name="intent" value={createProfessorIntent} />
          <FieldGroup>
            <ProfessorTextField
              control={form.control}
              fieldName="firstName"
              id={firstNameId}
              label="Nombre"
              autoComplete="given-name"
              serverError={serverFieldErrors.firstName}
            />

            <ProfessorTextField
              control={form.control}
              fieldName="lastName"
              id={lastNameId}
              label="Apellido"
              autoComplete="family-name"
              serverError={serverFieldErrors.lastName}
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

function ProfessorTextField({
  autoComplete,
  control,
  fieldName,
  id,
  label,
  serverError,
}: {
  autoComplete: string;
  control: Control<CreateProfessorFormValues>;
  fieldName: keyof CreateProfessorFormValues;
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
