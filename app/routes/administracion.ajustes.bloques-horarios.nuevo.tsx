import { useActionData } from "react-router";

import {
  action,
  AdministracionAjustesNuevoBloqueHorarioRouteView,
  useAdministracionAjustesLoaderData,
} from "./administracion.ajustes";

export { action };

export default function AdministracionAjustesNuevoBloqueHorarioRoute() {
  const loaderData = useAdministracionAjustesLoaderData();
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionAjustesNuevoBloqueHorarioRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
