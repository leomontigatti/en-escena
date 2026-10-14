import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import { action, loader } from "@/features/admin/users/detail/server";
import { InternalUserDetailRouteView } from "@/features/admin/users/detail/view";
import type { UserDetailRouteLoaderData } from "@/features/admin/users/detail/shared";

import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/administracion.usuarios_.$userId";

type LoaderData = UserDetailRouteLoaderData;
type ActionData = Awaited<ReturnType<typeof action>>;

type InternalUserDetailRouteProps = {
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
      const data = match.loaderData as LoaderData | undefined;
      return data ? { label: data.user.name } : null;
    },
  ],
  adminShell: { showEventSelector: false },
} satisfies AdminRouteHandle;

export { action, loader, InternalUserDetailRouteView };

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function InternalUserDetailRoute({
  loaderData,
}: InternalUserDetailRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <InternalUserDetailRouteView
      actionData={actionData}
      loaderData={loaderData}
    />
  );
}
