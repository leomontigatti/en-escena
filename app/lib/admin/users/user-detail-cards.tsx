import { type ReactNode } from "react";

import { AdminResourceFormCard } from "@/components/admin/resource-layout";
import { FormActions } from "@/components/shared/form-actions";
import {
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { FieldGroup } from "@/components/ui/field";
import {
  detailUserRoleOptions,
  detailUserStateOptions,
  type DetailUser,
} from "@/lib/admin/users/user-detail.shared";

/** What someone who may not manage users sees: the fields, and only `Volver`. */
export function InternalUserDetailCard({
  backToList,
  user,
}: {
  backToList: string;
  user: DetailUser;
}) {
  return (
    <ReadOnlyUserPage backToList={backToList}>
      <ReadOnlyField label="Nombre" value={user.name} />
      <ReadOnlyField
        label="Nombre de usuario interno"
        value={user.identifier}
      />
      <ReadOnlySelectField
        label="Permiso principal"
        options={detailUserRoleOptions}
        value={user.mainRole}
      />
      <ReadOnlySelectField
        label="Estado"
        options={detailUserStateOptions}
        value={user.state}
      />
    </ReadOnlyUserPage>
  );
}

export function AcademyUserFormCard({
  backToList,
  user,
}: {
  backToList: string;
  user: DetailUser;
}) {
  return (
    <ReadOnlyUserPage backToList={backToList}>
      <ReadOnlyField label="Nombre" value={user.name} />
      <ReadOnlyField label="Correo de acceso" value={user.email ?? ""} />
      <ReadOnlyField label="Tipo" value="Usuario de academia" />
      <ReadOnlyField label="Academia" value={user.academyName ?? ""} />
    </ReadOnlyUserPage>
  );
}

function ReadOnlyUserPage({
  backToList,
  children,
}: {
  backToList: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <UserFormCard>{children}</UserFormCard>
      <FormActions
        backTo={backToList}
        canEdit={false}
        hasChanges={false}
        isPending={false}
        onDiscard={() => {}}
      />
    </div>
  );
}

export function UserFormCard({ children }: { children: ReactNode }) {
  return (
    <AdminResourceFormCard>
      <FieldGroup className="grid gap-5 md:grid-cols-2">{children}</FieldGroup>
    </AdminResourceFormCard>
  );
}
