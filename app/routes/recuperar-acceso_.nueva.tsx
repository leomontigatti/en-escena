import { redirect } from "react-router";

import type { Route } from "./+types/recuperar-acceso_.nueva";

export async function loader({ request }: Route.LoaderArgs) {
  throw redirectToChangePassword(request);
}

export async function action({ request }: Route.ActionArgs) {
  throw redirectToChangePassword(request);
}

export default function RecuperarAccesoNuevaRedirectRoute() {
  return null;
}

function redirectToChangePassword(request: Request) {
  const url = new URL(request.url);
  const nextUrl = new URL("/cambiar-contrasena", request.url);

  if (url.search) {
    nextUrl.search = url.search;
  }

  return redirect(`${nextUrl.pathname}${nextUrl.search}`);
}
