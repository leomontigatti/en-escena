import type { AdminRouteHandle } from "@/components/admin/shell";
import { action, loader } from "@/features/admin/users/invitations/server";
import { internalInvitationRedirectPath } from "@/features/admin/users/invitations/shared";
import { AdministracionUsuariosInvitacionesRouteView } from "@/features/admin/users/invitations/view";

import type { Route } from "./+types/administracion.usuarios_.invitaciones";

export const meta: Route.MetaFunction = () => [
  { title: "Usuarios | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Usuarios", to: "/administracion/usuarios" },
    { label: "Invitaciones" },
  ],
  adminShell: { showEventSelector: false },
} satisfies AdminRouteHandle;

export default function AdministracionUsuariosInvitacionesRoute() {
  return <AdministracionUsuariosInvitacionesRouteView />;
}

export {
  action,
  loader,
  internalInvitationRedirectPath,
  AdministracionUsuariosInvitacionesRouteView,
};
