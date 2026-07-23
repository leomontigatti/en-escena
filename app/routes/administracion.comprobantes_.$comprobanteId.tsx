import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handleComprobanteDetailAction,
  loadComprobanteDetail,
  type ComprobanteDetailLoaderData,
} from "@/features/admin/comprobantes/detail/server";
import { AdministracionComprobanteDetalleRouteView } from "@/features/admin/comprobantes/detail/view";
import { formatComprobanteNumber } from "@/lib/comprobantes/format";

import type { Route } from "./+types/administracion.comprobantes_.$comprobanteId";

type LoaderData = ComprobanteDetailLoaderData;
type ActionData = Awaited<ReturnType<typeof action>>;

type AdministracionComprobanteDetalleRouteProps = {
  actionData?: ActionData;
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Detalle de comprobante | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Comprobantes", to: "/administracion/comprobantes" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      return {
        label: data ? formatComprobanteNumber(data.comprobante) : "Comprobante",
      };
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadComprobanteDetail(request, params.comprobanteId ?? "");
}

export async function action({ request, params }: Route.ActionArgs) {
  return await handleComprobanteDetailAction({
    request,
    comprobanteId: params.comprobanteId ?? "",
  });
}

export default function AdministracionComprobanteDetalleRoute({
  loaderData,
}: AdministracionComprobanteDetalleRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionComprobanteDetalleRouteView
      actionData={actionData}
      loaderData={loaderData}
    />
  );
}
