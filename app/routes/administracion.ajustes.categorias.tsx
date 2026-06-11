import { useActionData, useOutletContext } from "react-router";

import {
  action,
  AdministracionAjustesCategoriasRouteView,
  type AdministracionAjustesLoaderData,
} from "./administracion.ajustes";

export { action };

export default function AdministracionAjustesCategoriasRoute() {
  const loaderData = useOutletContext<AdministracionAjustesLoaderData>();
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionAjustesCategoriasRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
