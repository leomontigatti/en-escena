import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadPaymentsList } from "@/features/admin/payments/list/server";
import { PaymentsListRouteView } from "@/features/admin/payments/list/view";

import type { Route } from "./+types/administracion.movimientos";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type PaymentsListRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Movimientos | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Movimientos" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadPaymentsList(request);
}

export default function PaymentsListRoute({
  loaderData,
}: PaymentsListRouteProps) {
  return <PaymentsListRouteView loaderData={loaderData} />;
}
