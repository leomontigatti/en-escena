import { useActionData, useOutletContext } from "react-router";

import {
  action,
  AdministracionAjustesPreciosRouteView,
  type AdministracionAjustesLoaderData,
} from "./administracion.ajustes";

export { action };

export default function AdministracionAjustesPreciosRoute() {
  const loaderData = useOutletContext<AdministracionAjustesLoaderData>();
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionAjustesPreciosRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
