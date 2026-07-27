import { redirect } from "react-router";

import type { Route } from "./+types/administracion.academias.reporte";

// El loader siempre redirige, así que esta ruta nunca llega a renderizar:
// no define `meta` ni `handle` porque serían inalcanzables.
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);

  throw redirect(`/administracion/finanzas${url.search}`);
}

export default function AdministracionAcademiasReporteRoute() {
  return null;
}
