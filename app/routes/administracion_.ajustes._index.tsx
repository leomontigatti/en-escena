import { redirect } from "react-router";

import type { Route } from "./+types/administracion_.ajustes._index";

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);

  throw redirect(`/administracion/ajustes/eventos${url.search}`);
}
