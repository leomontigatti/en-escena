import { useActionData, useOutletContext } from "react-router";

import {
  action,
  AdministracionAjustesModalidadesRouteView,
  type AdministracionAjustesLoaderData,
} from "./administracion.ajustes";

export { action };

export default function AdministracionAjustesModalidadesRoute() {
  const loaderData = useOutletContext<AdministracionAjustesLoaderData>();
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionAjustesModalidadesRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
