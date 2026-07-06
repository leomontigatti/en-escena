import { type Control } from "react-hook-form";

import { ReadOnlyField } from "@/components/shared/read-only-field";
import { SelectField } from "@/components/shared/select-field";
import type { ChoreographyEditValues } from "@/features/portal/choreographies/detail/roster-editor.shared";

export { ReadOnlyField as ReadonlyDetailField };

export function ChoreographySelectPreviewField({
  control,
  fieldName,
  id,
  label,
  options,
}: {
  control: Control<ChoreographyEditValues>;
  fieldName: "experienceLevelId" | "scheduleCapacityId";
  id: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <SelectField
      control={control}
      id={id}
      label={label}
      name={fieldName}
      options={options}
      placeholder="Seleccionar"
    />
  );
}
