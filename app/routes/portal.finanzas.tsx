import type { PortalRouteHandle } from "@/components/portal/ui";
import { loadPortalAcademyFinances } from "@/features/portal/finances/server";
import { PortalAcademyFinancesRouteView } from "@/features/portal/finances/view";

export const meta = () => [
  { title: "Finanzas | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [{ label: "Finanzas" }],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  return await loadPortalAcademyFinances(request);
}

type PortalFinanzasRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export default function PortalFinanzasRoute({
  loaderData,
}: PortalFinanzasRouteProps) {
  return <PortalAcademyFinancesRouteView loaderData={loaderData} />;
}
