import { type Control } from "react-hook-form";

import { ReadOnlySelectField } from "@/components/shared/read-only-field";
import { SelectField } from "@/components/shared/select-field";
import {
  internalUserRoleOptions,
  type DetailUserRole,
  type UpdateInternalUserFormValues,
} from "@/lib/admin/users/user-detail.shared";

export function InternalUserEditRoleField({
  control,
  mainRole,
}: {
  control: Control<UpdateInternalUserFormValues>;
  mainRole: DetailUserRole;
}) {
  // An administrator's permission cannot be changed from the application, so the
  // field is locked like the internal username and the form submits it unchanged.
  if (mainRole === "admin") {
    return (
      <ReadOnlySelectField
        label="Permiso principal"
        options={internalUserRoleOptions}
        value={mainRole}
      />
    );
  }

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
