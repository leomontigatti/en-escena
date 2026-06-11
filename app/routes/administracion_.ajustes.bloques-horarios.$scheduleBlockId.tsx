import { useActionData, useParams } from "react-router";

import {
  action,
  AdministracionAjustesDetalleBloqueHorarioRouteView,
  useAdministracionAjustesLoaderData,
} from "./administracion_.ajustes";

export { action };

export default function AdministracionAjustesDetalleBloqueHorarioRoute() {
  const loaderData = useAdministracionAjustesLoaderData();
  const actionData = useActionData<typeof action>();
  const params = useParams();

  return (
    <AdministracionAjustesDetalleBloqueHorarioRouteView
      loaderData={loaderData}
      actionData={actionData}
      scheduleBlockId={params.scheduleBlockId ?? ""}
    />
  );
}
