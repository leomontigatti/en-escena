import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId } from "react";
import { useForm } from "react-hook-form";

import { SubmitButton } from "@/components/shared/action-buttons";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { getBirthDatePickerMonths } from "@/lib/dancers/birth-date";
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
import { FieldGroup } from "@/components/ui/field";
import {
  createValidatedReactRouterSubmitHandler,
  type ReactRouterFormSubmit,
} from "@/lib/shared/forms";
import {
  buildCreateDancerSchema,
  createDancerIntent,
  emptyDancerValues,
  type CreateDancerActionData,
  type CreateDancerFormValues,
} from "@/features/portal/dancers/create/shared";

export function CreateDancerDialog({
  actionData,
  eventStartDate,
  isOpen,
  isSubmitting,
  onOpenChange,
  submit,
}: {
  actionData?: Extract<CreateDancerActionData, { status: "error" }>;
  eventStartDate: string | null;
  isOpen: boolean;
  isSubmitting: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  submit: ReactRouterFormSubmit;
}) {
  const birthDateId = useId();
  const birthDateMonths = getBirthDatePickerMonths(eventStartDate);
  const form = useForm<CreateDancerFormValues>({
    resolver: zodResolver(buildCreateDancerSchema(eventStartDate)),
    defaultValues: actionData?.values ?? emptyDancerValues,
  });

  useEffect(() => {
    form.reset(actionData?.values ?? emptyDancerValues);
  }, [actionData?.values, form]);

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
            <TextInputField
              autoComplete="given-name"
              control={form.control}
              label="Nombre"
              name="firstName"
            />

            <TextInputField
              autoComplete="family-name"
              control={form.control}
              label="Apellido"
              name="lastName"
            />

            <DateOnlyField
              control={form.control}
              name="birthDate"
              id={birthDateId}
              label="Fecha de nacimiento"
              defaultMonth={birthDateMonths.defaultMonth}
              endMonth={birthDateMonths.endMonth}
              startMonth={birthDateMonths.startMonth}
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
