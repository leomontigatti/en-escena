import { redirect } from "react-router";

import type { Route } from "./+types/recuperar-acceso_.nueva";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const nextUrl = new URL("/cambiar-contrasena", request.url);

  if (url.search) {
    nextUrl.search = url.search;
  }

  throw redirect(`${nextUrl.pathname}${nextUrl.search}`);
}

export async function action({ request }: Route.ActionArgs) {
  const url = new URL(request.url);
  const nextUrl = new URL("/cambiar-contrasena", request.url);

  if (url.search) {
    nextUrl.search = url.search;
  }

  throw redirect(`${nextUrl.pathname}${nextUrl.search}`);
}

export default function RecuperarAccesoNuevaRedirectRoute() {
  return null;
}
