import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import { action, loader } from "@/features/admin/users/detail/server";
import { InternalUserDetailRouteView } from "@/features/admin/users/detail/view";
import type { UserDetailLoaderData } from "@/lib/admin/users/user-detail.shared";

import type { Route } from "./+types/administracion.usuarios_.$userId";

type LoaderData = UserDetailLoaderData;
type ActionData = Awaited<ReturnType<typeof action>>;

type AdministracionUsuarioDetalleRouteProps = {
  actionData?: ActionData;
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Usuario | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Usuarios", to: "/administracion/usuarios" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      return data ? { label: data.user.name } : null;
    },
  ],
  adminShell: { showEventSelector: false },
} satisfies AdminRouteHandle;

export { action, loader, InternalUserDetailRouteView };

export default function AdministracionUsuarioDetalleRoute({
  loaderData,
}: AdministracionUsuarioDetalleRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <InternalUserDetailRouteView
      actionData={actionData}
      loaderData={loaderData}
    />
  );
}
