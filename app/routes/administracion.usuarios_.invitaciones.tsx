import type { AdminRouteHandle } from "@/components/admin/shell";
import { action, loader } from "@/features/admin/users/invitations/server";
import { internalInvitationRedirectPath } from "@/features/admin/users/invitations/shared";
import { InternalUserInvitationsRouteView } from "@/features/admin/users/invitations/view";

import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

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

export default function InternalUserInvitationsRoute() {
  return <InternalUserInvitationsRouteView />;
}

export { action, loader, internalInvitationRedirectPath };

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}
