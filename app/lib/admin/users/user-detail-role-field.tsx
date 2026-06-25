import { useId } from "react";
import { Controller, type Control } from "react-hook-form";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UpdateInternalUserFormValues } from "@/lib/admin/users/user-detail.shared";

export function InternalUserEditRoleField({
  control,
}: {
  control: Control<UpdateInternalUserFormValues>;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller<UpdateInternalUserFormValues, "role">
      control={control}
      name="role"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor={id}>Permiso principal</FieldLabel>
          <Select
            name={field.name}
            value={field.value}
            onValueChange={field.onChange}
          >
            <SelectTrigger
              id={id}
              aria-describedby={fieldState.error ? errorId : undefined}
              aria-invalid={fieldState.error ? true : undefined}
            >
              <SelectValue placeholder="Elegí un permiso" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Administrador</SelectItem>
              <SelectItem value="auditor">Auditor</SelectItem>
              <SelectItem value="judge">Juez</SelectItem>
            </SelectContent>
          </Select>
          <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
        </Field>
      )}
    />
  );
}
