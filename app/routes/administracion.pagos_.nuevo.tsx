import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handleAdminPaymentCreateAction,
  loadAdminPaymentCreate,
} from "@/features/admin/payments/create/server";
import { AdministracionPagosNuevoRouteView } from "@/features/admin/payments/create/view";

import type { Route } from "./+types/administracion.pagos_.nuevo";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ActionData = Awaited<ReturnType<typeof action>>;

type AdministracionPagosNuevoRouteProps = {
  actionData?: ActionData;
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Registrar pago | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Pagos", to: "/administracion/pagos" },
    { label: "Registrar pago" },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadAdminPaymentCreate(request);
}

export async function action({ request }: Route.ActionArgs) {
  return await handleAdminPaymentCreateAction(request);
}

export { AdministracionPagosNuevoRouteView };

export default function AdministracionPagosNuevoRoute({
  loaderData,
}: AdministracionPagosNuevoRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionPagosNuevoRouteView
      actionData={actionData}
      loaderData={loaderData}
    />
  );
}
