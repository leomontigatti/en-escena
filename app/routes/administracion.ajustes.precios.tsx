import { useActionData } from "react-router";

import {
  action,
  AdministracionAjustesPreciosRouteView,
  useAdministracionAjustesLoaderData,
} from "./administracion.ajustes";

export { action };

export default function AdministracionAjustesPreciosRoute() {
  const loaderData = useAdministracionAjustesLoaderData();
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionAjustesPreciosRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
