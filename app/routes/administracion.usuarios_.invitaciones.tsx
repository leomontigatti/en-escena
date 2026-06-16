import { redirect } from "react-router";
import type { AdminRouteHandle } from "@/components/admin/shell";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";

import type { Route } from "./+types/administracion.usuarios_.invitaciones";

export const internalInvitationRedirectPath = "/administracion/usuarios/nuevo";

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

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdminPanelUser(request);

  throw redirect(internalInvitationRedirectPath);
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdminPanelUser(request);

  throw redirect(internalInvitationRedirectPath);
}

export default function AdministracionUsuariosInvitacionesRoute() {
  return null;
}
