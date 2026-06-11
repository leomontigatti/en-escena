import { useActionData } from "react-router";

import {
  action,
  AdministracionAjustesModalidadesRouteView,
  useAdministracionAjustesLoaderData,
} from "./administracion.ajustes";

export { action };

export default function AdministracionAjustesModalidadesRoute() {
  const loaderData = useAdministracionAjustesLoaderData();
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionAjustesModalidadesRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
