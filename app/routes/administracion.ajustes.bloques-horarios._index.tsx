import {
  AdministracionAjustesBloquesHorariosRouteView,
  useAdministracionAjustesLoaderData,
} from "./administracion.ajustes";

export default function AdministracionAjustesBloquesHorariosIndexRoute() {
  const loaderData = useAdministracionAjustesLoaderData();

  return (
    <AdministracionAjustesBloquesHorariosRouteView loaderData={loaderData} />
  );
}
