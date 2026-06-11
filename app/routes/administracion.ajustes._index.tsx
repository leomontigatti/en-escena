import {
  AdministracionAjustesIndexRouteView,
  useAdministracionAjustesLoaderData,
} from "./administracion.ajustes";

export default function AdministracionAjustesIndexRoute() {
  const loaderData = useAdministracionAjustesLoaderData();

  return <AdministracionAjustesIndexRouteView loaderData={loaderData} />;
}
