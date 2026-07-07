import { type Control } from "react-hook-form";

import { SelectField } from "@/components/shared/select-field";
import {
  internalUserRoleOptions,
  type UpdateInternalUserFormValues,
} from "@/lib/admin/users/user-detail.shared";

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
