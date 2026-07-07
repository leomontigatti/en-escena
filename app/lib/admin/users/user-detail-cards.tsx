import { type ReactNode } from "react";
import { Link } from "react-router";

import { AdminResourceFormCard } from "@/components/admin/resource-layout";
import {
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import {
  detailUserRoleOptions,
  detailUserStateOptions,
  type DetailUser,
} from "@/lib/admin/users/user-detail.shared";

export function InternalUserDetailCard({ user }: { user: DetailUser }) {
  return (
    <UserFormCard>
      <ReadOnlyField label="Nombre" value={user.name} />
      <ReadOnlyField
        label="Nombre de usuario interno"
        value={user.identifier}
      />
      <ReadOnlyField label="Correo" value={user.email ?? ""} />
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
    </UserFormCard>
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
    <UserFormCard
      footer={
        <Button asChild variant="outline">
          <Link to={backToList}>Volver</Link>
        </Button>
      }
    >
      <ReadOnlyField label="Nombre" value={user.name} />
      <ReadOnlyField label="Correo de acceso" value={user.email ?? ""} />
      <ReadOnlyField label="Tipo" value="Usuario de academia" />
      <ReadOnlyField label="Academia" value={user.academyName ?? ""} />
    </UserFormCard>
  );
}

export function UserFormCard({
  children,
  footer,
  title,
}: {
  children: ReactNode;
  footer?: ReactNode;
  title?: string;
}) {
  return (
    <AdminResourceFormCard footer={footer} title={title}>
      <FieldGroup className="grid gap-5 md:grid-cols-2">{children}</FieldGroup>
    </AdminResourceFormCard>
  );
}
