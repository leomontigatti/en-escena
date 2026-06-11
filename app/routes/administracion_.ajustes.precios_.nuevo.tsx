import { useActionData } from "react-router";

import {
  action,
  AdministracionAjustesPrecioNuevaRouteView,
  useAdministracionAjustesLoaderData,
} from "./administracion_.ajustes";

export { action };

export default function AdministracionAjustesPrecioNuevaRoute() {
  const loaderData = useAdministracionAjustesLoaderData();
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionAjustesPrecioNuevaRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
