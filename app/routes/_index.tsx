import { redirect } from "react-router";

import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import { getPostLoginPathForUserId } from "@/lib/auth/internal-navigation.server";

import type { Route } from "./+types/_index";

export const meta: Route.MetaFunction = () => [
  { title: "En Escena" },
  {
    name: "description",
    content: "Gestión integral de competencias de danza.",
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  const session = await accessAuthProvider.getAccessSession(request);

  if (!session) {
    throw redirect("/ingresar");
  }

  throw redirect(await getPostLoginPathForUserId(session.user.id));
}

export default function IndexRoute() {
  return null;
}
