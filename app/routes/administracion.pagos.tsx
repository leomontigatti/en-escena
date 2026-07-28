import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdminPaymentsList } from "@/features/admin/payments/list/server";
import { PaymentsListRouteView } from "@/features/admin/payments/list/view";

import type { Route } from "./+types/administracion.pagos";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type PaymentsListRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Pagos | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Pagos" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadAdminPaymentsList(request);
}

export { PaymentsListRouteView };

export default function PaymentsListRoute({
  loaderData,
}: PaymentsListRouteProps) {
  return <PaymentsListRouteView loaderData={loaderData} />;
}
