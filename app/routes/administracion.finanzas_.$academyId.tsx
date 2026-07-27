import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdminAcademyFinances } from "@/features/admin/finances/academy-choreographies/server";
import { AdministracionFinanzasAcademiaRouteView } from "@/features/admin/finances/academy-choreographies/view";

import type { Route } from "./+types/administracion.finanzas_.$academyId";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionFinanzasAcademiaRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Finanzas | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Finanzas", to: "/administracion/finanzas" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      return data?.academy ? { label: data.academy.name } : null;
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadAdminAcademyFinances({ request, params });
}

export { AdministracionFinanzasAcademiaRouteView };

export default function AdministracionFinanzasAcademiaRoute({
  loaderData,
}: AdministracionFinanzasAcademiaRouteProps) {
  return <AdministracionFinanzasAcademiaRouteView loaderData={loaderData} />;
}
