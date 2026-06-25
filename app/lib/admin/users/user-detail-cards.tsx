import { Lock, type LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  getRoleLabel,
  getStateLabel,
  type DetailUser,
} from "@/lib/admin/users/user-detail.shared";

export function InternalUserDetailCard({ user }: { user: DetailUser }) {
  return (
    <UserFormCard>
      <LockedUserField label="Nombre" value={user.name} />
      <LockedUserField
        label="Nombre de usuario interno"
        value={user.identifier}
      />
      <LockedUserField label="Correo" value={user.email ?? ""} />
      <LockedUserField
        label="Permiso principal"
        value={getRoleLabel(user.mainRole)}
      />
      <LockedUserField label="Estado" value={getStateLabel(user.state)} />
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
        <Button asChild variant="outline" size="lg">
          <Link to={backToList}>Volver</Link>
        </Button>
      }
    >
      <LockedUserField label="Nombre" value={user.name} />
      <LockedUserField label="Correo de acceso" value={user.email ?? ""} />
      <LockedUserField label="Tipo" value="Usuario de academia" />
      <LockedUserField label="Academia" value={user.academyName ?? ""} />
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
    <Card>
      {title ? (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent>
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          {children}
        </FieldGroup>
      </CardContent>
      {footer ? (
        <CardFooter className="justify-end gap-3 border-0 bg-transparent pt-0">
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  );
}

export function LockedUserField({
  icon: Icon = Lock,
  label,
  value,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
}) {
  const id = useId();

  return (
    <Field data-disabled>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <Input id={id} value={value} disabled readOnly className="pr-9" />
        <Icon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    </Field>
  );
}
