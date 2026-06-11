import { useActionData, useParams } from "react-router";

import {
  action,
  AdministracionAjustesCategoriaDetalleRouteView,
  useAdministracionAjustesLoaderData,
} from "./administracion_.ajustes";

export { action };

export default function AdministracionAjustesCategoriasDetalleRoute() {
  const loaderData = useAdministracionAjustesLoaderData();
  const actionData = useActionData<typeof action>();
  const params = useParams();

  return (
    <AdministracionAjustesCategoriaDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
      categoryId={params.categoryId ?? ""}
    />
  );
}
