import { useOutletContext } from "react-router";

import {
  AdministracionAjustesIndexRouteView,
  type AdministracionAjustesLoaderData,
} from "./administracion.ajustes";

export default function AdministracionAjustesIndexRoute() {
  const loaderData = useOutletContext<AdministracionAjustesLoaderData>();

  return <AdministracionAjustesIndexRouteView loaderData={loaderData} />;
}
