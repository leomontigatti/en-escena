import { useActionData, useParams } from "react-router";

import {
  action,
  AdministracionAjustesModalidadDetalleRouteView,
  useAdministracionAjustesLoaderData,
} from "./administracion.ajustes";

export { action };

export default function AdministracionAjustesModalidadDetalleRoute() {
  const loaderData = useAdministracionAjustesLoaderData();
  const actionData = useActionData<typeof action>();
  const params = useParams();

  return (
    <AdministracionAjustesModalidadDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
      modalityId={params.modalityId ?? ""}
    />
  );
}
