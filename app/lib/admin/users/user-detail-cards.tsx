import { type ReactNode } from "react";

import { AdminResourceFormCard } from "@/components/admin/resource-layout";
import { FormActions } from "@/components/shared/form-actions";
import {
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { FieldGroup } from "@/components/ui/field";
import { type DetailUser } from "@/lib/admin/users/user-detail.shared";
import { userRoleOptions } from "@/lib/auth/user-role.shared";

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
        options={userRoleOptions}
        value={user.mainRole}
      />
    </ReadOnlyUserPage>
  );
}

/** An academy's or an individual's access, read-only: neither is edited here. */
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
      <ReadOnlyField
        label="Tipo"
        value={
          user.userType === "individual" ? "Particular" : "Usuario de academia"
        }
      />
      {user.userType === "academy" ? (
        <ReadOnlyField label="Academia" value={user.academyName ?? ""} />
      ) : null}
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
      <UserFormCard
        footer={
          <FormActions
            backTo={backToList}
            canEdit={false}
            hasChanges={false}
            isPending={false}
            onDiscard={() => {}}
          />
        }
      >
        {children}
      </UserFormCard>
    </div>
  );
}

export function UserFormCard({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <AdminResourceFormCard footer={footer}>
      <FieldGroup className="grid gap-5 md:grid-cols-2">{children}</FieldGroup>
    </AdminResourceFormCard>
  );
}
