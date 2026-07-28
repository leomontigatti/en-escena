import type { AdminRouteHandle } from "@/components/admin/shell";
import { loader } from "@/features/admin/users/list/server";
import { InternalUsersListRouteView } from "@/features/admin/users/list/view";

import type { Route } from "./+types/administracion.usuarios";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type InternalUsersListRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Usuarios | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Usuarios" }],
  adminShell: { showEventSelector: false },
} satisfies AdminRouteHandle;

export { loader, InternalUsersListRouteView };

export default function InternalUsersListRoute({
  loaderData,
}: InternalUsersListRouteProps) {
  return <InternalUsersListRouteView loaderData={loaderData} />;
}
