import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, type ReactNode } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";

import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { useRosterDocumentConflictField } from "@/components/shared/roster-document-conflict";
import { TextInputField } from "@/components/shared/text-input-field";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

import {
  buildProfessorEditSchema,
  getProfessorDocumentConflict,
  type ProfessorActionError,
  type ProfessorEditFormValues,
  type ProfessorStatusAction,
} from "./shared";

type ProfessorEditFormReturn = UseFormReturn<
  ProfessorEditFormValues,
  unknown,
  ProfessorEditFormValues
>;

export type ProfessorEditFormController = {
  documentConflictDescription: ReactNode;
  form: ProfessorEditFormReturn;
};

export function useProfessorEditForm({
  actionData,
  values,
}: {
  actionData?: ProfessorActionError;
  values: ProfessorEditFormValues;
}): ProfessorEditFormController {
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

  const documentConflictDescription = useRosterDocumentConflictField({
    actionData,
    conflict: getProfessorDocumentConflict(actionData),
    name: "documentNumber",
    setError: form.setError,
  });

  return { documentConflictDescription, form };
}

export function ProfessorActionsMenu({
  onSelect,
  statusAction,
}: {
  onSelect: (intent: ProfessorStatusAction["intent"]) => void;
  statusAction: ProfessorStatusAction;
}) {
  return (
    <ResourceActionsMenu contentClassName="w-40">
      <DropdownMenuItem
        disabled={statusAction.disabled}
        variant={
          statusAction.intent === "archive-professor"
            ? "destructive"
            : "default"
        }
        onSelect={(event) => {
          event.preventDefault();
          onSelect(statusAction.intent);
        }}
      >
        {statusAction.label}
      </DropdownMenuItem>
    </ResourceActionsMenu>
  );
}

export function ProfessorTextField({
  description,
  form,
  label,
  name,
}: {
  description?: ReactNode;
  form: ProfessorEditFormReturn;
  label: string;
  name: "documentNumber" | "firstName" | "lastName";
}) {
  return (
    <TextInputField
      autoComplete="off"
      control={form.control}
      description={description}
      label={label}
      name={name}
    />
  );
}
