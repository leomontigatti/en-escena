import { type Control } from "react-hook-form";

import { SelectField } from "@/components/shared/select-field";
import type { UpdateInternalUserFormValues } from "@/lib/admin/users/user-detail.shared";

const internalUserRoleOptions = [
  { value: "admin", label: "Administrador" },
  { value: "auditor", label: "Auditor" },
  { value: "judge", label: "Juez" },
];

export function InternalUserEditRoleField({
  control,
}: {
  control: Control<UpdateInternalUserFormValues>;
}) {
  return (
    <SelectField
      control={control}
      label="Permiso principal"
      name="role"
      options={internalUserRoleOptions}
      placeholder="Elegí un permiso"
    />
  );
}
