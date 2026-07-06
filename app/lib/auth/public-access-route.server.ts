import { data } from "react-router";

import { redirectSignedInUserFromPublicRoute } from "@/lib/auth/internal-navigation.server";

export async function loadPublicAccessRoute(request: Request) {
  const publicRouteInit = await redirectSignedInUserFromPublicRoute(request);

  return data(null, publicRouteInit ?? undefined);
}

export async function loadPublicAccessRouteLoader({
  request,
}: {
  request: Request;
  [key: string]: unknown;
}) {
  return await loadPublicAccessRoute(request);
}
