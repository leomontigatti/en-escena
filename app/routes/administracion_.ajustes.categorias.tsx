import { useActionData } from "react-router";

import {
  action,
  AdministracionAjustesCategoriasRouteView,
  useAdministracionAjustesLoaderData,
} from "./administracion_.ajustes";

export { action };

export default function AdministracionAjustesCategoriasRoute() {
  const loaderData = useAdministracionAjustesLoaderData();
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionAjustesCategoriasRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
