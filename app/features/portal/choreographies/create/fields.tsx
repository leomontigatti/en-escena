import { Controller, type Control } from "react-hook-form";

import { MultiComboboxField } from "@/components/shared/multi-combobox-field";
import {
  Field,
  FieldContent,
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
    <Controller
      control={control}
      name={fieldName}
      render={({ field, fieldState }) => {
        const isInvalid = Boolean(fieldState.error?.message);

        return (
          <Field data-invalid={isInvalid ? true : undefined}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <FieldContent>
              <Input
                {...field}
                id={id}
                placeholder={placeholder}
                aria-invalid={isInvalid ? true : undefined}
              />
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        );
      }}
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
    <Controller
      control={control}
      name={fieldName}
      render={({ field, fieldState }) => {
        const isInvalid = Boolean(fieldState.error?.message);

        return (
          <Field data-invalid={isInvalid ? true : undefined}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <FieldContent>
              <Select
                name={field.name}
                value={field.value ?? ""}
                onValueChange={(value) => {
                  field.onChange(value);
                  onValueChange?.(value);
                }}
              >
                <SelectTrigger
                  id={id}
                  aria-invalid={isInvalid ? true : undefined}
                  className="w-full"
                >
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  side="bottom"
                  align="start"
                  avoidCollisions={false}
                >
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        );
      }}
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
