import { type Control } from "react-hook-form";

import { MultiComboboxField } from "@/components/shared/multi-combobox-field";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
import type { CreateChoreographyFormValues } from "@/features/portal/choreographies/create/flow";

import type {
  ActiveDancer,
  ActiveProfessor,
} from "@/features/portal/choreographies/create/shared";

type CreateChoreographyFieldName =
  | "modalityId"
  | "submodalityId"
  | "experienceLevelId"
  | "scheduleCapacityId";

type SelectOption = {
  value: string;
  label: string;
};

export function CreateChoreographyTextField({
  control,
  fieldName,
  id,
  label,
  placeholder,
}: {
  control: Control<CreateChoreographyFormValues>;
  fieldName: "name";
  id: string;
  label: string;
  placeholder?: string;
}) {
  return (
    <TextInputField
      control={control}
      id={id}
      label={label}
      name={fieldName}
      placeholder={placeholder}
    />
  );
}

export function CreateChoreographySelectField({
  control,
  fieldName,
  id,
  label,
  onValueChange,
  options,
}: {
  control: Control<CreateChoreographyFormValues>;
  fieldName: CreateChoreographyFieldName;
  id: string;
  label: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
}) {
  return (
    <SelectField
      control={control}
      contentProps={{
        position: "popper",
        side: "bottom",
        align: "start",
        avoidCollisions: false,
      }}
      id={id}
      label={label}
      name={fieldName}
      onValueChange={onValueChange}
      options={options}
      placeholder="Seleccionar"
    />
  );
}

export function CreateChoreographyDancersField({
  control,
  dancers,
  onValueChange,
}: {
  control: Control<CreateChoreographyFormValues>;
  dancers: ActiveDancer[];
  onValueChange: () => void;
}) {
  return (
    <MultiComboboxField
      control={control}
      name="dancerIds"
      label="Bailarines"
      options={dancers.map((dancer) => ({
        value: dancer.id,
        label: `${dancer.firstName} ${dancer.lastName}`,
      }))}
      placeholder="Seleccionar bailarines"
      emptyMessage="Sin bailarines disponibles"
      onValueChange={onValueChange}
      searchable={true}
    />
  );
}

export function CreateChoreographyProfessorsField({
  control,
  professors,
}: {
  control: Control<CreateChoreographyFormValues>;
  professors: ActiveProfessor[];
}) {
  return (
    <MultiComboboxField
      control={control}
      name="professorIds"
      label="Profesores"
      options={professors.map((professor) => ({
        value: professor.id,
        label: `${professor.firstName} ${professor.lastName}`,
      }))}
      placeholder="Seleccionar profesores"
      emptyMessage="Sin profesores disponibles"
      searchable={true}
    />
  );
}
