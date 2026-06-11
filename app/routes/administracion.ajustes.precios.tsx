import {
  AdministracionAjustesPreciosRouteView,
  useAdministracionAjustesLoaderData,
} from "./administracion.ajustes";

export default function AdministracionAjustesPreciosRoute() {
  const loaderData = useAdministracionAjustesLoaderData();

  return <AdministracionAjustesPreciosRouteView loaderData={loaderData} />;
}
