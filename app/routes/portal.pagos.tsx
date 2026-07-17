import type { PortalRouteHandle } from "@/components/portal/ui";
import { loadPortalAcademyPayments } from "@/features/portal/payments/list/server";
import { PortalAcademyPaymentsRouteView } from "@/features/portal/payments/list/view";

export const meta = () => [
  { title: "Pagos | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [{ label: "Pagos" }],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  return await loadPortalAcademyPayments(request);
}

type PortalPagosRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export default function PortalPagosRoute({
  loaderData,
}: PortalPagosRouteProps) {
  return <PortalAcademyPaymentsRouteView loaderData={loaderData} />;
}
