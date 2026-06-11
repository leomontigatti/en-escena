import {
  action,
  AdministracionAjustesModalidadesListRouteView,
  useAdministracionAjustesLoaderData,
} from "./administracion_.ajustes";

export { action };

export default function AdministracionAjustesModalidadesRoute() {
  const loaderData = useAdministracionAjustesLoaderData();

  return (
    <AdministracionAjustesModalidadesListRouteView loaderData={loaderData} />
  );
}
