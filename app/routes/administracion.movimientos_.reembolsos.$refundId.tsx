import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handleRefundDetailAction,
  loadRefundDetail,
} from "@/features/admin/finances/refunds/server";
import {
  RefundDetailRouteView,
  getRefundDisplayName,
} from "@/features/admin/finances/refunds/view";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/administracion.movimientos_.reembolsos.$refundId";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ActionData = Awaited<ReturnType<typeof action>>;

type RefundDetailRouteProps = {
  actionData?: ActionData;
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Detalle de reembolso | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Movimientos", to: "/administracion/movimientos" },
    (match) => {
      const data = match.loaderData as LoaderData | undefined;

      return { label: getRefundDisplayName(data?.refund) };
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadRefundDetail(request, params.refundId ?? "");
}

export async function action({ request, params }: Route.ActionArgs) {
  return await handleRefundDetailAction(request, params.refundId ?? "");
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function RefundDetailRoute({
  loaderData,
}: RefundDetailRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <RefundDetailRouteView actionData={actionData} loaderData={loaderData} />
  );
}
