import { zodResolver } from "@hookform/resolvers/zod";
import { Lock } from "lucide-react";
import { useEffect, useId } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";

import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createValidatedNativeSubmitHandler,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";

import {
  buildProfessorEditSchema,
  buildProfessorReasonSchema,
  emptyProfessorFieldErrors,
  noDocumentTypeSelectValue,
  type ProfessorEditFormValues,
  type ProfessorReasonFormValues,
} from "./professor-detail.shared";
import type { AdministrativeProfessorFieldErrors } from "@/lib/admin/professors/professors.server";

type ProfessorEditFormReturn = UseFormReturn<
  ProfessorEditFormValues,
  unknown,
  ProfessorEditFormValues
>;

type ProfessorReasonFormReturn = UseFormReturn<
  ProfessorReasonFormValues,
  unknown,
  ProfessorReasonFormValues
>;

export function useProfessorEditForm({
  fieldErrors = emptyProfessorFieldErrors,
  values,
}: {
  fieldErrors?: AdministrativeProfessorFieldErrors;
  values: ProfessorEditFormValues;
}) {
  const form = useForm<
    ProfessorEditFormValues,
    unknown,
    ProfessorEditFormValues
  >({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(buildProfessorEditSchema()),
  });

  useEffect(() => {
    form.reset(values);
  }, [
    form,
    values.documentNumber,
    values.documentType,
    values.firstName,
    values.lastName,
  ]);

  useApplyServerFieldErrors(form, fieldErrors);

  return { form };
}

export function useProfessorReasonForm({
  correctionReasonRequired,
  fieldErrors = emptyProfessorFieldErrors,
  values,
}: {
  correctionReasonRequired: boolean;
  fieldErrors?: AdministrativeProfessorFieldErrors;
  values: ProfessorReasonFormValues;
}) {
  const form = useForm<
    ProfessorReasonFormValues,
    unknown,
    ProfessorReasonFormValues
  >({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(buildProfessorReasonSchema(correctionReasonRequired)),
  });

  useEffect(() => {
    form.reset(values);
  }, [form, values.correctionReason, values.statusIntent]);

  useApplyServerFieldErrors(form, fieldErrors);

  return { form, handleSubmit: createValidatedNativeSubmitHandler(form) };
}

export function ProfessorActionsMenu({
  active,
  onSelect,
}: {
  active: boolean;
  onSelect: (intent: "archive-professor" | "reactivate-professor") => void;
}) {
  return (
    <ResourceActionsMenu contentClassName="w-40">
      <DropdownMenuItem
        variant={active ? "destructive" : "default"}
        onSelect={(event) => {
          event.preventDefault();
          onSelect(active ? "archive-professor" : "reactivate-professor");
        }}
      >
        {active ? "Archivar" : "Reactivar"}
      </DropdownMenuItem>
    </ResourceActionsMenu>
  );
}

export function ProfessorTextField({
  form,
  label,
  name,
}: {
  form: ProfessorEditFormReturn;
  label: string;
  name: "documentNumber" | "firstName" | "lastName";
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <FieldContent>
            <Input
              id={id}
              aria-invalid={fieldState.error ? true : undefined}
              aria-describedby={fieldState.error ? errorId : undefined}
              autoComplete="off"
              {...field}
            />
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

export function ProfessorDocumentTypeField({
  form,
}: {
  form: ProfessorEditFormReturn;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller
      control={form.control}
      name="documentType"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor={id}>Tipo de documento</FieldLabel>
          <FieldContent>
            <Select
              value={field.value || noDocumentTypeSelectValue}
              onValueChange={(value) => {
                field.onChange(
                  value === noDocumentTypeSelectValue ? "" : value,
                );
              }}
            >
              <input type="hidden" name={field.name} value={field.value} />
              <SelectTrigger
                id={id}
                aria-invalid={fieldState.error ? true : undefined}
                aria-describedby={fieldState.error ? errorId : undefined}
                className="h-10 w-full"
              >
                <SelectValue placeholder="Sin documento" />
              </SelectTrigger>
              <SelectContent align="start" position="popper" side="bottom">
                <SelectItem value={noDocumentTypeSelectValue}>
                  Sin documento
                </SelectItem>
                <SelectItem value="dni">DNI</SelectItem>
                <SelectItem value="passport">Pasaporte</SelectItem>
                <SelectItem value="other">Otro</SelectItem>
              </SelectContent>
            </Select>
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

export function ProfessorCorrectionReasonField({
  form,
  required,
}: {
  form: ProfessorReasonFormReturn;
  required: boolean;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <Controller
      control={form.control}
      name="correctionReason"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor={id}>Motivo de corrección</FieldLabel>
          <FieldContent>
            <Textarea
              id={id}
              aria-invalid={fieldState.error ? true : undefined}
              aria-describedby={
                fieldState.error ? `${hintId} ${errorId}` : hintId
              }
              {...field}
            />
            <FieldDescription id={hintId}>
              {required
                ? "Obligatorio entre 10 y 500 caracteres para este profesor."
                : "Opcional. Si lo completás, usá entre 10 y 500 caracteres."}
            </FieldDescription>
            <input
              type="hidden"
              name="statusIntent"
              value={form.getValues("statusIntent") ?? ""}
            />
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

export function ReadOnlyField({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  const id = useId();

  return (
    <Field className={className} data-disabled>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        <div className="relative">
          <Input id={id} value={value} disabled readOnly className="pr-9" />
          <Lock
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </FieldContent>
    </Field>
  );
}
