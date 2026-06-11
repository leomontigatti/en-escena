import {
  AdministracionAjustesPreciosRouteView,
  useAdministracionAjustesLoaderData,
} from "./administracion_.ajustes";

export default function AdministracionAjustesPreciosRoute() {
  const loaderData = useAdministracionAjustesLoaderData();

  return <AdministracionAjustesPreciosRouteView loaderData={loaderData} />;
}
