import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  loadComprobanteDetail,
  type ComprobanteDetailLoaderData,
} from "@/features/admin/comprobantes/detail/server";
import { ComprobanteDetailRouteView } from "@/features/admin/comprobantes/detail/view";
import { formatComprobanteNumber } from "@/lib/comprobantes/format";

import type { Route } from "./+types/administracion.comprobantes_.$comprobanteId";

type LoaderData = ComprobanteDetailLoaderData;

type ComprobanteDetailRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Detalle de comprobante | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Comprobantes", to: "/administracion/comprobantes" },
    (match) => {
      const data = match.loaderData as LoaderData | undefined;
      return {
        label: data ? formatComprobanteNumber(data.comprobante) : "Comprobante",
      };
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadComprobanteDetail(request, params.comprobanteId ?? "");
}

export default function ComprobanteDetailRoute({
  loaderData,
}: ComprobanteDetailRouteProps) {
  return <ComprobanteDetailRouteView loaderData={loaderData} />;
}
