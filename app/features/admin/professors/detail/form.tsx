import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormReturn } from "react-hook-form";

import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { TextInputField } from "@/components/shared/text-input-field";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useSavedFormValues } from "@/lib/shared/forms";

import {
  buildProfessorEditSchema,
  type ProfessorEditFormValues,
  type ProfessorStatusAction,
} from "./shared";

type ProfessorEditFormReturn = UseFormReturn<
  ProfessorEditFormValues,
  unknown,
  ProfessorEditFormValues
>;

export type ProfessorEditFormController = {
  discard: () => void;
  form: ProfessorEditFormReturn;
  hasChanges: boolean;
};

/**
 * Measured against what is saved: a refused save puts what was typed back as
 * the current values with the saved ones kept as defaults, so the form still
 * reads as changed. A successful save revalidates the loader and the new saved
 * values reset it to clean. See the dancer twin.
 */
export function useProfessorEditForm({
  savedValues,
  submittedValues,
}: {
  savedValues: ProfessorEditFormValues;
  submittedValues: ProfessorEditFormValues | null;
}): ProfessorEditFormController {
  const form = useForm<
    ProfessorEditFormValues,
    unknown,
    ProfessorEditFormValues
  >({
    // The effect below corrects the defaults; this only keeps the first render
    // (and a server render) showing what was typed.
    defaultValues: submittedValues ?? savedValues,
    mode: "onSubmit",
    resolver: zodResolver(buildProfessorEditSchema()),
  });
  useSavedFormValues(form, savedValues, submittedValues);

  return {
    discard: () => form.reset(savedValues),
    form,
    hasChanges: form.formState.isDirty,
  };
}

export function ProfessorActionsMenu({
  onSelect,
  onSelectMerge,
  statusAction,
}: {
  onSelect: (intent: ProfessorStatusAction["intent"]) => void;
  onSelectMerge: () => void;
  statusAction: ProfessorStatusAction;
}) {
  // `Archivar` and `Fusionar` are both destructive, so nothing ordinary comes
  // before them; the reactivation is, and a separator sets `Fusionar` apart.
  const isArchive = statusAction.intent === "archive-professor";

  return (
    <ResourceActionsMenu contentClassName="w-40">
      <DropdownMenuItem
        variant={isArchive ? "destructive" : "default"}
        onSelect={() => onSelect(statusAction.intent)}
      >
        {statusAction.label}
      </DropdownMenuItem>
      {isArchive ? null : <DropdownMenuSeparator />}
      <DropdownMenuItem variant="destructive" onSelect={() => onSelectMerge()}>
        Fusionar
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
