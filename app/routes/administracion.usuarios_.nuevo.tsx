import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import { action, loader } from "@/features/admin/users/create/server";
import { AdministracionUsuariosNuevoRouteView } from "@/features/admin/users/create/view";
import type { CreateInternalUserActionData } from "@/features/admin/users/create/shared";

import type { Route } from "./+types/administracion.usuarios_.nuevo";

type AdministracionUsuariosNuevoRouteProps = {
  actionData?: CreateInternalUserActionData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Nuevo usuario | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Usuarios", to: "/administracion/usuarios" },
    { label: "Nuevo usuario" },
  ],
  adminShell: { showEventSelector: false },
} satisfies AdminRouteHandle;

export { action, loader, AdministracionUsuariosNuevoRouteView };

export default function AdministracionUsuariosNuevoRoute() {
  const actionData = useActionData<typeof action>();

  return <AdministracionUsuariosNuevoRouteView actionData={actionData} />;
}
