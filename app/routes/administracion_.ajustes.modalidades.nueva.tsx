import { useActionData } from "react-router";

import {
  action,
  AdministracionAjustesNuevaModalidadRouteView,
  useAdministracionAjustesLoaderData,
} from "./administracion_.ajustes";

export { action };

export default function AdministracionAjustesNuevaModalidadRoute() {
  const loaderData = useAdministracionAjustesLoaderData();
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionAjustesNuevaModalidadRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
