import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { SubmitButton } from "@/components/shared/action-buttons";
import { TextInputField } from "@/components/shared/text-input-field";
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
  createProfessorIntent,
  createProfessorSchema,
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
  actionData?: Extract<CreateProfessorActionData, { status: "error" }>;
  isOpen: boolean;
  isSubmitting: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  submit: ReactRouterFormSubmit;
}) {
  const form = useForm<CreateProfessorFormValues>({
    resolver: zodResolver(createProfessorSchema),
    defaultValues: actionData?.values ?? emptyProfessorValues,
  });

  useEffect(() => {
    form.reset(actionData?.values ?? emptyProfessorValues);
  }, [actionData?.values, form]);

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
