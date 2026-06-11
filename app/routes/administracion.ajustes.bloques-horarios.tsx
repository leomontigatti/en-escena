import { useActionData, useOutletContext } from "react-router";

import {
  action,
  AdministracionAjustesBloquesHorariosRouteView,
  type AdministracionAjustesLoaderData,
} from "./administracion.ajustes";

export { action };

export default function AdministracionAjustesBloquesHorariosRoute() {
  const loaderData = useOutletContext<AdministracionAjustesLoaderData>();
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionAjustesBloquesHorariosRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
