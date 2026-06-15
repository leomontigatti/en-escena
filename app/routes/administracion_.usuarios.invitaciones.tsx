import { redirect } from "react-router";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";

import type { Route } from "./+types/administracion_.usuarios.invitaciones";

export const meta: Route.MetaFunction = () => [
  { title: "Usuarios | Panel de administración | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdminPanelUser(request);

  throw redirect("/administracion/usuarios/nuevo");
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdminPanelUser(request);

  throw redirect("/administracion/usuarios/nuevo");
}

export default function AdministracionUsuariosInvitacionesRoute() {
  return null;
}
