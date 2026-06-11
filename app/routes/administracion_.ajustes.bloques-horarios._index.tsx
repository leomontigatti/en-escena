import {
  AdministracionAjustesBloquesHorariosRouteView,
  useAdministracionAjustesLoaderData,
} from "./administracion_.ajustes";

export default function AdministracionAjustesBloquesHorariosIndexRoute() {
  const loaderData = useAdministracionAjustesLoaderData();

  return (
    <AdministracionAjustesBloquesHorariosRouteView loaderData={loaderData} />
  );
}
