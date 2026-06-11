import { useActionData } from "react-router";

import {
  action,
  AdministracionAjustesBloquesHorariosRouteView,
  useAdministracionAjustesLoaderData,
} from "./administracion.ajustes";

export { action };

export default function AdministracionAjustesBloquesHorariosRoute() {
  const loaderData = useAdministracionAjustesLoaderData();
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionAjustesBloquesHorariosRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
