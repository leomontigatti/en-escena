import { useActionData } from "react-router";

import {
  action,
  AdministracionAjustesCategoriaNuevaRouteView,
  useAdministracionAjustesLoaderData,
} from "./administracion_.ajustes";

export { action };

export default function AdministracionAjustesCategoriasNuevaRoute() {
  const loaderData = useAdministracionAjustesLoaderData();
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionAjustesCategoriaNuevaRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
