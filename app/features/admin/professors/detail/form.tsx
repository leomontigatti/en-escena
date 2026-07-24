import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";

import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { TextInputField } from "@/components/shared/text-input-field";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

import {
  buildProfessorEditSchema,
  type ProfessorEditFormValues,
} from "./shared";

type ProfessorEditFormReturn = UseFormReturn<
  ProfessorEditFormValues,
  unknown,
  ProfessorEditFormValues
>;

export type ProfessorEditFormController = {
  form: ProfessorEditFormReturn;
};

export function useProfessorEditForm({
  values,
}: {
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

  return { form };
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
  return (
    <TextInputField
      autoComplete="off"
      control={form.control}
      label={label}
      name={name}
    />
  );
}
