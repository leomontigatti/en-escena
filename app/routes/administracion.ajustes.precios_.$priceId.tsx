import { useActionData, useParams } from "react-router";

import {
  action,
  AdministracionAjustesPrecioDetalleRouteView,
  useAdministracionAjustesLoaderData,
} from "./administracion.ajustes";

export { action };

export default function AdministracionAjustesPrecioDetalleRoute() {
  const loaderData = useAdministracionAjustesLoaderData();
  const actionData = useActionData<typeof action>();
  const params = useParams();

  return (
    <AdministracionAjustesPrecioDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
      priceId={params.priceId ?? ""}
    />
  );
}
