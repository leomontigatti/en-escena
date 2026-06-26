import type { AdminRouteHandle } from "@/components/admin/shell";
import type { Route } from "./+types/administracion.coreografias";
import { loadAdministrativeChoreographyListRouteData } from "@/features/admin/choreographies/list/server";
import { AdministracionCoreografiasRouteView } from "@/features/admin/choreographies/list/view";
type LoaderData = Awaited<
  ReturnType<typeof loadAdministrativeChoreographyListRouteData>
>;

type AdministracionCoreografiasRouteProps = {
  loaderData: LoaderData;
};

export const meta = () => [
  { title: "Coreografías | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Coreografías" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadAdministrativeChoreographyListRouteData(request);
}

export { AdministracionCoreografiasRouteView };

export default function AdministracionCoreografiasRoute({
  loaderData,
}: AdministracionCoreografiasRouteProps) {
  return <AdministracionCoreografiasRouteView loaderData={loaderData} />;
}
