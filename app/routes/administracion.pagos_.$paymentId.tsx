import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  PaymentDetailRouteView,
  getAdminPaymentDisplayName,
} from "@/features/admin/payments/detail/view";
import {
  handleAdminPaymentDetailAction,
  loadAdminPaymentDetail,
} from "@/features/admin/payments/detail/server";

import type { Route } from "./+types/administracion.pagos_.$paymentId";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ActionData = Awaited<ReturnType<typeof action>>;

type PaymentDetailRouteProps = {
  actionData?: ActionData;
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Detalle de pago | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Pagos", to: "/administracion/pagos" },
    (match) => {
      const data = match.data as LoaderData | undefined;

      return { label: getAdminPaymentDisplayName(data?.payment) };
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadAdminPaymentDetail(request, params.paymentId ?? "");
}

export async function action({ request, params }: Route.ActionArgs) {
  return await handleAdminPaymentDetailAction(request, params.paymentId ?? "");
}

export default function PaymentDetailRoute({
  loaderData,
}: PaymentDetailRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <PaymentDetailRouteView actionData={actionData} loaderData={loaderData} />
  );
}
